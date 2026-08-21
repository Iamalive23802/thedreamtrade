const express = require('express');
const { getMarketTickers } = require('../controllers/market');

const router = express.Router();

router.get('/tickers', getMarketTickers);

module.exports = router;
