const fetch = require('node:fetch');

async function testFetch() {
  const ids = ["731604991", "1609173007", "1404697612", "889745138", "924933745", "895717375"];
  const form = new URLSearchParams();
  form.append("itemcount", ids.length.toString());
  form.append("includetags", "true");
  form.append("includepreviews", "true");
  form.append("includekvtags", "true");
  for (let i = 0; i < ids.length; i++) {
    form.append(`publishedfileids[${i}]`, ids[i]);
  }

  const url = "https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/";
  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      }
    });
    const data = await res.json();
    console.log("RESPONSE KEYS:", Object.keys(data));
    console.log("RESPONSE DETAILS SAMPLE:", JSON.stringify(data.response.publishedfiledetails[0], null, 2));
    console.log("ALL FILES METADATA:");
    data.response.publishedfiledetails.forEach(f => {
      console.log(`ID: ${f.publishedfileid} | Title: ${f.title} | Result: ${f.result} | Subscriptions: ${f.subscriptions} | Size: ${f.file_size} | PreviewUrl: ${f.preview_url}`);
    });
  } catch (err) {
    console.error("Fetch failed:", err);
  }
}

testFetch();
