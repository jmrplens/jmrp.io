import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export interface CVEntry {
    title: string;
    type: string;
    contents: any[];
}

export function getCVData() {
    const filePath = path.join(process.cwd(), 'src/data/cv.yml');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return yaml.load(fileContents) as CVEntry[];
}
