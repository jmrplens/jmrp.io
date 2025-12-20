const fs = require('fs');
const path = require('path');

const manifestPath = './.lighthouseci/manifest.json';
const linksPath = './.lighthouseci/links.json';

try {
  // Check if manifest exists
  if (!fs.existsSync(manifestPath)) {
    console.error('Lighthouse manifest not found');
    process.exit(0); // Exit gracefully if no report
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Links file is created by lhci upload if using temporary-public-storage? 
  // Actually, lhci autorun might not create links.json with temporary-public-storage unless configured.
  // We might have to rely on the output capture or just list the scores if URL is missing.
  // However, usually manifest contains local paths.
  
  // Let's assume we want to average the scores if there are multiple runs.
  // manifest is an array of entries.
  
  const summary = {};
  let count = 0;

  manifest.forEach(run => {
    if (!run.jsonPath) return;
    const json = JSON.parse(fs.readFileSync(run.jsonPath, 'utf8'));
    const categories = json.categories;
    
    Object.keys(categories).forEach(key => {
      if (!summary[key]) summary[key] = 0;
      summary[key] += categories[key].score;
    });
    count++;
  });

  if (count === 0) {
    console.log("No runs found");
    process.exit(0);
  }

  const scores = {};
  Object.keys(summary).forEach(key => {
    scores[key] = Math.round((summary[key] / count) * 100);
  });

  // Read the URL from the output capture if passed as arg, or try to find links.json
  // For temporary-public-storage, lhci prints it. 
  // We will pass the captured URL as an environment variable or argument if possible.
  // Or simpler: Just output the markdown table, and let the workflow append the URL if it found it.
  
  console.log('### ⚡ Lighthouse Report');
  console.log('| Category | Score |');
  console.log('| --- | --- |');
  console.log(`| 🟢 Performance | ${scores.performance}% |`);
  console.log(`| ♿ Accessibility | ${scores.accessibility}% |`);
  console.log(`| 💡 Best Practices | ${scores['best-practices']}% |`);
  console.log(`| 🔍 SEO | ${scores.seo}% |`);
  // PWA might not be present or important, check if it exists
  if (scores.pwa) {
     console.log(`| 📱 PWA | ${scores.pwa}% |`);
  }

} catch (e) {
  console.error(e);
  process.exit(1);
}
