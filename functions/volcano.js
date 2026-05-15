exports.handler = async (event) => {
  const type = event.queryStringParameters.type || 'json';
  const targetUrl = type === 'rss'
    ? 'https://volcanoes.usgs.gov/hans-public/api/feed/hvo'
    : 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/summary/HVO';

  console.log("FUNCTION STARTING. Target URL is:", targetUrl);

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    console.log("FETCH COMPLETE. Status:", response.status);
    console.log("FINAL FETCHED URL:", response.url);

    const data = await response.text();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: data
    };
  } catch (error) {
    console.log("FETCH ERROR:", error.message);
    return { statusCode: 500, body: error.message };
  }
};
