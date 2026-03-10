const fs = require('fs');
const data = fs.readFileSync('C:/Users/saniy/Downloads/the_story_of_the_quran.pdf');
const text = data.toString('latin1');
const matches = text.match(/\(([^)]{3,})\)/g) || [];
const filtered = matches
  .map(m => m.slice(1, -1))
  .filter(t => t.length > 2 && !(/^[\d\s.]+$/.test(t)));
filtered.forEach((t, i) => console.log(i + ': ' + t));
