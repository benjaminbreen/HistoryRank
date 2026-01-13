const fs = require('fs');
const path = require('path');

const INPUT_PATH = process.env.REGION_CSV || path.join(process.cwd(), 'data', 'regions', 'region-map.csv');

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
}

function toCsvRow(values) {
  return values
    .map((value) => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes('"') || str.includes(',') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    })
    .join(',');
}

const REGION_MACRO = {
  'Northern Europe': 'Europe',
  'Western Europe': 'Europe',
  'Southern Europe': 'Europe',
  'Eastern Europe': 'Europe',
  'North Africa': 'Africa',
  'West Africa': 'Africa',
  'East Africa': 'Africa',
  'Central Africa': 'Africa',
  'Southern Africa': 'Africa',
  'Western Asia': 'Asia',
  'Central Asia': 'Asia',
  'South Asia': 'Asia',
  'East Asia': 'Asia',
  'Southeast Asia': 'Asia',
  'North America': 'Americas',
  'Mesoamerica & Caribbean': 'Americas',
  'South America': 'Americas',
  'Oceania': 'Oceania',
};

const REGION_BY_COUNTRY = new Map([
  ['United Kingdom', 'Northern Europe'],
  ['England', 'Northern Europe'],
  ['Scotland', 'Northern Europe'],
  ['Wales', 'Northern Europe'],
  ['Ireland', 'Northern Europe'],
  ['France', 'Western Europe'],
  ['Germany', 'Western Europe'],
  ['Netherlands', 'Western Europe'],
  ['Belgium', 'Western Europe'],
  ['Switzerland', 'Western Europe'],
  ['Austria', 'Western Europe'],
  ['Italy', 'Southern Europe'],
  ['Spain', 'Southern Europe'],
  ['Portugal', 'Southern Europe'],
  ['Greece', 'Southern Europe'],
  ['Poland', 'Eastern Europe'],
  ['Czech Republic', 'Eastern Europe'],
  ['Czechia', 'Eastern Europe'],
  ['Hungary', 'Eastern Europe'],
  ['Romania', 'Eastern Europe'],
  ['Bulgaria', 'Eastern Europe'],
  ['Ukraine', 'Eastern Europe'],
  ['Russia', 'Eastern Europe'],
  ['Belarus', 'Eastern Europe'],
  ['Serbia', 'Eastern Europe'],
  ['Croatia', 'Eastern Europe'],
  ['Slovakia', 'Eastern Europe'],
  ['Slovenia', 'Eastern Europe'],
  ['Lithuania', 'Eastern Europe'],
  ['Latvia', 'Eastern Europe'],
  ['Estonia', 'Eastern Europe'],
  ['Norway', 'Northern Europe'],
  ['Sweden', 'Northern Europe'],
  ['Denmark', 'Northern Europe'],
  ['Finland', 'Northern Europe'],
  ['Iceland', 'Northern Europe'],
  ['Turkey', 'Western Asia'],
  ['Iran', 'Western Asia'],
  ['Iraq', 'Western Asia'],
  ['Syria', 'Western Asia'],
  ['Israel', 'Western Asia'],
  ['Palestine', 'Western Asia'],
  ['Lebanon', 'Western Asia'],
  ['Jordan', 'Western Asia'],
  ['Saudi Arabia', 'Western Asia'],
  ['Yemen', 'Western Asia'],
  ['Oman', 'Western Asia'],
  ['United Arab Emirates', 'Western Asia'],
  ['Qatar', 'Western Asia'],
  ['Kuwait', 'Western Asia'],
  ['Bahrain', 'Western Asia'],
  ['Egypt', 'North Africa'],
  ['Libya', 'North Africa'],
  ['Algeria', 'North Africa'],
  ['Tunisia', 'North Africa'],
  ['Morocco', 'North Africa'],
  ['Sudan', 'North Africa'],
  ['Nigeria', 'West Africa'],
  ['Ghana', 'West Africa'],
  ['Senegal', 'West Africa'],
  ['Mali', 'West Africa'],
  ['Guinea', 'West Africa'],
  ['Ivory Coast', 'West Africa'],
  ['Côte d’Ivoire', 'West Africa'],
  ['Ethiopia', 'East Africa'],
  ['Kenya', 'East Africa'],
  ['Tanzania', 'East Africa'],
  ['Uganda', 'East Africa'],
  ['Somalia', 'East Africa'],
  ['Eritrea', 'East Africa'],
  ['Rwanda', 'East Africa'],
  ['Burundi', 'East Africa'],
  ['Cameroon', 'Central Africa'],
  ['Angola', 'Central Africa'],
  ['Democratic Republic of the Congo', 'Central Africa'],
  ['Republic of the Congo', 'Central Africa'],
  ['Gabon', 'Central Africa'],
  ['Chad', 'Central Africa'],
  ['Central African Republic', 'Central Africa'],
  ['South Africa', 'Southern Africa'],
  ['Namibia', 'Southern Africa'],
  ['Botswana', 'Southern Africa'],
  ['Zimbabwe', 'Southern Africa'],
  ['Zambia', 'Southern Africa'],
  ['Mozambique', 'Southern Africa'],
  ['Madagascar', 'Southern Africa'],
  ['India', 'South Asia'],
  ['Pakistan', 'South Asia'],
  ['Bangladesh', 'South Asia'],
  ['Sri Lanka', 'South Asia'],
  ['Nepal', 'South Asia'],
  ['Bhutan', 'South Asia'],
  ['Afghanistan', 'South Asia'],
  ['China', 'East Asia'],
  ['Japan', 'East Asia'],
  ['South Korea', 'East Asia'],
  ['North Korea', 'East Asia'],
  ['Korea', 'East Asia'],
  ['Mongolia', 'East Asia'],
  ['Taiwan', 'East Asia'],
  ['Vietnam', 'Southeast Asia'],
  ['Thailand', 'Southeast Asia'],
  ['Cambodia', 'Southeast Asia'],
  ['Laos', 'Southeast Asia'],
  ['Myanmar', 'Southeast Asia'],
  ['Malaysia', 'Southeast Asia'],
  ['Indonesia', 'Southeast Asia'],
  ['Philippines', 'Southeast Asia'],
  ['Singapore', 'Southeast Asia'],
  ['Brunei', 'Southeast Asia'],
  ['Timor-Leste', 'Southeast Asia'],
  ['United States', 'North America'],
  ['Canada', 'North America'],
  ['Mexico', 'Mesoamerica & Caribbean'],
  ['Guatemala', 'Mesoamerica & Caribbean'],
  ['Honduras', 'Mesoamerica & Caribbean'],
  ['El Salvador', 'Mesoamerica & Caribbean'],
  ['Nicaragua', 'Mesoamerica & Caribbean'],
  ['Costa Rica', 'Mesoamerica & Caribbean'],
  ['Panama', 'Mesoamerica & Caribbean'],
  ['Cuba', 'Mesoamerica & Caribbean'],
  ['Haiti', 'Mesoamerica & Caribbean'],
  ['Dominican Republic', 'Mesoamerica & Caribbean'],
  ['Jamaica', 'Mesoamerica & Caribbean'],
  ['Brazil', 'South America'],
  ['Argentina', 'South America'],
  ['Chile', 'South America'],
  ['Peru', 'South America'],
  ['Colombia', 'South America'],
  ['Venezuela', 'South America'],
  ['Ecuador', 'South America'],
  ['Bolivia', 'South America'],
  ['Uruguay', 'South America'],
  ['Paraguay', 'South America'],
  ['Guyana', 'South America'],
  ['Suriname', 'South America'],
  ['Australia', 'Oceania'],
  ['New Zealand', 'Oceania'],
]);

function findRegionByPolity(polity) {
  if (!polity) return null;
  for (const [needle, region] of REGION_BY_COUNTRY.entries()) {
    if (polity.includes(needle)) return region;
  }
  return null;
}

if (!fs.existsSync(INPUT_PATH)) {
  console.error(`Missing ${INPUT_PATH}`);
  process.exit(1);
}

const content = fs.readFileSync(INPUT_PATH, 'utf-8').trim();
const lines = content.split('\n');
const headers = parseCsvLine(lines[0]);

const rows = lines.slice(1).map((line) => {
  const values = parseCsvLine(line);
  const row = {};
  headers.forEach((header, idx) => {
    row[header] = values[idx] || '';
  });
  return row;
});

rows.forEach((row) => {
  const region = findRegionByPolity(row.birth_polity || '');
  if (region) {
    row.region_sub = region;
    row.region_macro = REGION_MACRO[region] || row.region_macro;
  }
});

const out = [toCsvRow(headers)];
rows.forEach((row) => {
  out.push(toCsvRow(headers.map((h) => row[h] ?? '')));
});

fs.writeFileSync(INPUT_PATH, `${out.join('\n')}\n`, 'utf-8');
console.log(`Normalized regions in ${INPUT_PATH}`);
