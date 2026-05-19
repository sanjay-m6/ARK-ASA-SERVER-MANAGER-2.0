import fs from 'fs';
import https from 'https';

const modIds = [
  "731604991", "1404697612", "889745138", "1565015734", "924933745",
  "895717375", "1814953878", "751991809", "839162288", "1609173007",
  "719928795", "1999447172", "566885839", "1404692743", "670764308",
  "1333033585", "708807240", "742230089", "512515543", "1675895024",
  "1213004416", "609380111"
];

function fetchPage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function main() {
  const results = [];
  console.log(`Starting fetching for ${modIds.length} mods...`);
  
  for (const id of modIds) {
    try {
      const html = await fetchPage(`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`);
      
      // Extract title
      let title = "";
      const titleMatch = html.match(/<div class="workshopItemTitle">([^<]+)<\/div>/);
      if (titleMatch) {
        title = titleMatch[1].trim();
      }

      // Extract preview image
      let imageUrl = "";
      const imgMatch = html.match(/<link rel="image_src" href="([^"]+)">/);
      if (imgMatch) {
        imageUrl = imgMatch[1];
      }

      // Extract subscriber count
      let subs = 0;
      const subsMatch = html.match(/(\d[\d,\s]*)\s+Subscriptions/i);
      if (subsMatch) {
        subs = parseInt(subsMatch[1].replace(/[\s,]/g, ''), 10);
      }

      // Extract file size
      let fileSizeStr = "";
      const sizeMatch = html.match(/<div class="detailsStatRight">([^<]+)<\/div>/i);
      if (sizeMatch) {
        fileSizeStr = sizeMatch[1].trim();
      }

      // Extract description
      let description = "";
      const descMatch = html.match(/<div class="workshopItemDescription" id="highlightContent">([\s\S]+?)<\/div>/);
      if (descMatch) {
        description = descMatch[1].replace(/<[^>]+>/g, '').trim().substring(0, 180) + "...";
      }

      results.push({
        workshopId: id,
        name: title || id,
        description: description || "No description available.",
        previewUrl: imageUrl || "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80",
        subscriberCount: subs || 100000,
        fileSizeStr: fileSizeStr || "50 MB"
      });
      console.log(`Successfully fetched mod ${id}: ${title}`);
    } catch (e) {
      console.error(`Error fetching mod ${id}:`, e.message);
    }
  }

  fs.writeFileSync('scripts/mod_details.json', JSON.stringify(results, null, 2));
  console.log("Done! Written to scripts/mod_details.json");
}

main();
