exports.handler = async (event) => {
  const type = event.queryStringParameters.type || 'json';
  const url = type === 'rss'
    ? 'https://volcanoes.usgs.gov/hans-public/api/feed/hvo'
    : 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/summary/HVO';

  try {
    const response = await fetch(url);
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
