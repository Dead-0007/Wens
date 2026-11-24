const fs = require('fs');

let indexHtml = fs.readFileSync('index.html', 'utf8');

indexHtml = indexHtml.replace(/<article class="panel fasting-card reveal delay-4">[\s\S]*?<\/article>/, '');
indexHtml = indexHtml.replace(/<section class="panel ideas-panel reveal delay-4">[\s\S]*?<\/section>/, '');

fs.writeFileSync('index.html', indexHtml);
console.log('Done cleaning home view');
