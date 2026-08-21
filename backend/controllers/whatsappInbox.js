const path = require('path');
const fs = require('fs');
const multer = require('multer');
const inbox = require('../utils/whatsappInbox');
const cloudApi = require('../utils/whatsappCloudApi');

inbox.ensureUploadDir();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    inbox.ensureUploadDir();
    cb(null, inbox.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 8);
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});
const mediaUpload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }).single('file');

const inferMediaType = (mime) => {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.startsWith('audio/')) return 'audio';
  if (mime?.startsWith('video/')) return 'video';
  return 'document';
};

const assertSessionOpen = (conversation) => {
  if (!inbox.isSessionOpen(conversation.last_customer_message_at)) {
    const err = new Error('The 24-hour customer care window is closed. Send an approved template instead.');
    err.code = 'WINDOW_CLOSED';
    err.status = 409;
    throw err;
  }
};

const listConversations = async (req, res) => {
  try {
    const conversations = await inbox.listConversations({ q: req.query.q });
    res.json({ conversations });
  } catch (err) {
    console.error('[WhatsApp inbox] listConversations:', err.message);
    res.status(500).json({ message: 'Failed to load conversations' });
  }
};

const getMessages = async (req, res) => {
  try {
    const conversation = await inbox.getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    const messages = await inbox.listMessages(conversation.id, { limit: req.query.limit });
    await inbox.markConversationRead(conversation.id);
    conversation.unread_count = 0;
    res.json({ conversation, messages });
  } catch (err) {
    console.error('[WhatsApp inbox] getMessages:', err.message);
    res.status(500).json({ message: 'Failed to load messages' });
  }
};

const sendText = async (req, res) => {
  try {
    const conversation = await inbox.getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Message body is required' });
    assertSessionOpen(conversation);
    const graph = await cloudApi.sendText({ to: conversation.wa_id, body });
    const wamid = cloudApi.extractOutboundWamid(graph);
    const message = await inbox.persistOutboundMessage({
      conversation, wamid, type: 'text', body,
      status: wamid ? 'sent' : 'failed', sentByUserId: req.user?.id, raw: graph,
    });
    res.json({ message, conversation: await inbox.getConversation(conversation.id) });
  } catch (err) {
    console.error('[WhatsApp inbox] sendText:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Failed to send message', code: err.code });
  }
};

const sendMedia = async (req, res) => {
  try {
    const conversation = await inbox.getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    if (!req.file) return res.status(400).json({ message: 'File is required' });
    assertSessionOpen(conversation);
    const type = inferMediaType(req.file.mimetype);
    const caption = String(req.body?.caption || '').trim();
    const uploaded = await cloudApi.uploadMedia({
      filePath: req.file.path, mimeType: req.file.mimetype, filename: req.file.originalname,
    });
    const graph = await cloudApi.sendMediaMessage({
      to: conversation.wa_id, type, mediaId: uploaded.id, caption, filename: req.file.originalname,
    });
    const wamid = cloudApi.extractOutboundWamid(graph);
    const message = await inbox.persistOutboundMessage({
      conversation, wamid, type, body: caption, graphMediaId: uploaded.id,
      localFilename: path.basename(req.file.path), mimeType: req.file.mimetype,
      filename: req.file.originalname, status: wamid ? 'sent' : 'failed',
      sentByUserId: req.user?.id, raw: graph,
    });
    res.json({ message, conversation: await inbox.getConversation(conversation.id) });
  } catch (err) {
    console.error('[WhatsApp inbox] sendMedia:', err.message);
    if (req.file?.path) fs.unlink(req.file.path, () => {});
    res.status(err.status || 500).json({ message: err.message || 'Failed to send media', code: err.code });
  }
};

const sendTemplate = async (req, res) => {
  try {
    const conversation = await inbox.getConversation(req.params.id);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    const name = String(req.body?.name || '').trim();
    const language = String(req.body?.language || 'en').trim();
    if (!name) return res.status(400).json({ message: 'Template name is required' });
    const graph = await cloudApi.sendTemplate({
      to: conversation.wa_id, name, language, components: req.body?.components || [],
    });
    const wamid = cloudApi.extractOutboundWamid(graph);
    const message = await inbox.persistOutboundMessage({
      conversation, wamid, type: 'template', body: req.body?.preview || name,
      templateName: name, templateLanguage: language,
      status: wamid ? 'sent' : 'failed', sentByUserId: req.user?.id, raw: graph,
    });
    res.json({ message, conversation: await inbox.getConversation(conversation.id) });
  } catch (err) {
    console.error('[WhatsApp inbox] sendTemplate:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Failed to send template', code: err.code });
  }
};

const listTemplates = async (req, res) => {
  try {
    const templates = await cloudApi.listTemplates({ force: req.query.refresh === '1' });
    res.json({ templates });
  } catch (err) {
    console.error('[WhatsApp inbox] listTemplates:', err.message);
    res.status(err.status || 500).json({ message: err.message || 'Failed to load templates', code: err.code });
  }
};

const getMedia = async (req, res) => {
  try {
    const message = await inbox.getMessage(req.params.messageId);
    if (!message) return res.status(404).json({ message: 'Media not found' });
    const filePath = inbox.mediaFilePath(message.local_filename);
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'Media file not available yet' });
    }
    res.setHeader('Content-Type', message.mime_type || 'application/octet-stream');
    const downloadName = message.filename || path.basename(filePath);
    res.setHeader(
      'Content-Disposition',
      ['image', 'audio', 'video', 'sticker'].includes(message.type)
        ? `inline; filename="${downloadName}"`
        : `attachment; filename="${downloadName}"`
    );
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[WhatsApp inbox] getMedia:', err.message);
    res.status(500).json({ message: 'Failed to load media' });
  }
};

module.exports = {
  mediaUpload, listConversations, getMessages, sendText, sendMedia, sendTemplate, listTemplates, getMedia,
};
