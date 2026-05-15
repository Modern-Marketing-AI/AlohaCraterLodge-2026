exports.handler = async (event) => {
  const type = event.queryStringParameters.type || 'json';
  const targetUrl = type === 'rss'
    ? 'https://volcanoes.usgs.gov/hans-public/api/notice/recent/hvo/7'
    : 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/vhpstatus?obs=hvo';

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const data = await response.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: data
    };
  } catch (error) {
    return { statusCode: 500, body: error.message };
  }
};
