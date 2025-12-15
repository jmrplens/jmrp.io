
import sharp from 'sharp';
import fs from 'fs';

const inputFile = 'public/img/avatar.png';
const outputFile = 'public/favicon.png';

sharp(inputFile)
    .resize(32, 32)
    .toFile(outputFile)
    .then(info => { console.log('Favicon created:', info); })
    .catch(err => { console.error('Error creating favicon:', err); });
