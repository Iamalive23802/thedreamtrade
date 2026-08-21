const express = require('express');
const {
  verifyWebhook,
  handleWebhookEvent,
} = require('../controllers/facebookWebhook');

const router = express.Router();

router.get('/', verifyWebhook);
router.post('/', handleWebhookEvent);

module.exports = router;
