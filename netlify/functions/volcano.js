exports.handler = async (event) => {
  const type = event.queryStringParameters.type || 'json';
  const url = type === 'rss'
    ? 'https://volcanoes.usgs.gov/hans-public/api/feed/hvo'
    : 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/summary/HVO';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });
    const data = await response.text();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": type === 'rss' ? "application/xml" : "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: data
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
