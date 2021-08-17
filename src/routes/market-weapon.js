const { DB } = require('../db');
const { redis } = require('../helpers/redis-helper');

exports.route = (app) => {
  app.get('/static/market/weapon', async (req, res) => {
    // clean incoming params
    let {
      element, minStars, maxStars, sortBy, sortDir, pageSize, pageNum, sellerAddress, buyerAddress,
      minPrice, maxPrice, network,
    } = req.query;

    element = element || '';
    sellerAddress = sellerAddress || '';
    buyerAddress = buyerAddress || '';
    network = network || 'bsc';

    if (minPrice) minPrice = +minPrice;
    minPrice = Math.max(minPrice, 0);

    if (maxPrice) maxPrice = +maxPrice;
    maxPrice = Math.max(maxPrice, 0);

    if (minStars) minStars = +minStars;
    minStars = minStars || 1;

    if (maxStars) maxStars = +maxStars;
    maxStars = maxStars || 5;

    sortBy = sortBy || 'timestamp';

    if (sortDir) sortDir = +sortDir;
    sortDir = sortDir || -1;

    if (pageSize) pageSize = +pageSize;
    pageSize = pageSize || 60;
    pageSize = Math.max(1, Math.min(pageSize, 60));

    if (pageNum) pageNum = +pageNum;
    pageNum = pageNum || 0;

    // build a query
    const query = { };

    if (network) query.network = network;
    if (element) query.weaponElement = element;
    if (sellerAddress) query.sellerAddress = sellerAddress;
    if (buyerAddress) query.buyerAddress = buyerAddress;
    if (!buyerAddress) query.buyerAddress = { $eq: null };
    if (minStars || maxStars) {
      query.weaponStars = {};
      if (minStars) query.weaponStars.$gte = minStars;
      if (maxStars) query.weaponStars.$lte = maxStars;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = minPrice;
      if (maxPrice) query.price.$lte = maxPrice;
    }

    // build options
    const options = {
      skip: pageSize * pageNum,
      limit: pageSize,
    };

    if (sortBy && sortDir) {
      options.sort = { [sortBy]: sortDir };
    }

    const cacheKey = `${JSON.stringify(query)}-${JSON.stringify(options)}`;
	

    // only unauthenticated requests hit redis
    if (redis && !req.isAuthenticated) {
      const cached = await redis.exists(`mweapon-${cacheKey}`);
      if (cached) {
        const dataRedis = await redis.get(`mweapon-${cacheKey}`);
        const data = JSON.parse(dataRedis);
        if (data && data.results && data.results.length > 0) {
          res.json(data);
          return;
        }
      }
    }

    // get and send results
    try {
      const resultsCursor = await DB.$marketWeapons.find(cacheKey);
	  const allResultsCursor = await DB.$marketWeapons.find(JSON.stringify(query));


      const results = await resultsCursor.toArray();
	  

      const totalDocuments = await allResultsCursor.count();
	  
      const numPages = Math.floor(totalDocuments / pageSize);

      const resData = {
        results,
        idResults: results.map((x) => x.weaponId),
        page: {
          curPage: pageNum,
          curOffset: pageNum * pageSize,
          total: totalDocuments,
          pageSize,
          numPages,
        },
      };

      res.json(resData);

      if (redis) redis.set(`mweapon-${cacheKey}`, JSON.stringify(resData), 'ex', 450);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error });
    }
  });

  app.put('/market/weapon/:network/:weaponId', async (req, res) => {
    const { weaponId, network } = req.params;
    const {
      price, weaponStars, weaponElement, stat1Element, stat1Value,
      stat2Element, stat2Value, stat3Element, stat3Value, timestamp, sellerAddress, buyerAddress,
    } = req.body;

    if (!price || !weaponId || !weaponStars || !weaponElement || !stat1Element
     || !stat1Value || !timestamp || !sellerAddress || !network) {
      return res.status(400).json({
        error: 'Invalid body. Must pass price, weaponId, weaponStars, weaponElement, stat1Element, stat1Value, timestamp, sellerAddress, network.',
      });
    }

    try {
      await DB.$marketWeapons.replaceOne({ weaponId, network }, {
        price,
        weaponId,
        weaponStars,
        weaponElement,
        stat1Element,
        stat1Value,
        stat2Element,
        stat2Value,
        stat3Element,
        stat3Value,
        timestamp,
        sellerAddress,
        buyerAddress,
        network,
      }, { upsert: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error });
    }

    return res.json({ added: true });
  });

  app.get('/market/weapon/:network/:weaponId/sell', async (req, res) => {
    const { weaponId, network } = req.params;

    if (!weaponId || !network) {
      return res.status(400).json({ error: 'Invalid weaponId or network.' });
    }

    try {
      const currentMarketEntry = await DB.$marketWeapons.findOne({ weaponId, network });
      if (currentMarketEntry) {
        const { _id, ...weapon } = currentMarketEntry;
        await DB.$marketSales.insert({ type: 'weapon', weapon });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error });
    }

    return res.json({ sold: true });
  });

  app.delete('/market/weapon/:network/:weaponId', async (req, res) => {
    const { weaponId, network } = req.params;

    if (!weaponId || !network) {
      return res.status(400).json({ error: 'Invalid weaponId or network' });
    }

    try {
      await DB.$marketWeapons.removeOne({ weaponId, network });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error });
    }

    return res.json({ deleted: true });
  });

  app.delete('/market/weapon/all/:sellerAddress', async (req, res) => {
    const { sellerAddress } = req.params;

    if (!sellerAddress) {
      return res.status(400).json({ error: 'Invalid address.' });
    }

    try {
      await DB.$marketWeapons.remove({ sellerAddress });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error });
    }

    return res.json({ deleted: true });
  });
};
