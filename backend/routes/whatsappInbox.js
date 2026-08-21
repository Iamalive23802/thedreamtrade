const express = require('express');
const {
  mediaUpload,
  listConversations,
  getMessages,
  sendText,
  sendMedia,
  sendTemplate,
  listTemplates,
  getMedia,
} = require('../controllers/whatsappInbox');

const router = express.Router();
router.get('/conversations', listConversations);
router.get('/conversations/:id/messages', getMessages);
router.post('/conversations/:id/messages', sendText);
router.post('/conversations/:id/media', mediaUpload, sendMedia);
router.post('/conversations/:id/template', sendTemplate);
router.get('/templates', listTemplates);
router.get('/media/:messageId', getMedia);
module.exports = router;
