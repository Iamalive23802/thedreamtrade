const express = require('express');
const {
  verifyWebhook,
  handleWebhookEvent,
} = require('../controllers/whatsappWebhook');

const router = express.Router();

router.get('/', verifyWebhook);
router.post('/', handleWebhookEvent);

module.exports = router;
