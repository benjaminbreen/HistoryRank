/**
 * Seed the name_aliases table with known name variations
 * Run with: npx tsx scripts/seed-aliases.ts
 */

import { db, nameAliases } from '../src/lib/db';
import { normalizeName } from '../src/lib/utils/nameNormalization';

// Known name variations mapped to canonical figure IDs (from Pantheon)
const knownAliases: Array<{ alias: string; figureId: string }> = [
  // Jesus variants (Pantheon: "Jesus")
  { alias: 'jesus christ', figureId: 'jesus' },
  { alias: 'jesus of nazareth', figureId: 'jesus' },
  { alias: 'christ', figureId: 'jesus' },

  // Buddha variants (Pantheon: "Gautama Buddha")
  { alias: 'siddhartha gautama', figureId: 'gautama-buddha' },
  { alias: 'siddhartha gautama buddha', figureId: 'gautama-buddha' },
  { alias: 'buddha', figureId: 'gautama-buddha' },
  { alias: 'the buddha', figureId: 'gautama-buddha' },

  // Paul variants (Pantheon: "Paul the Apostle")
  { alias: 'paul of tarsus', figureId: 'paul-the-apostle' },
  { alias: 'st paul', figureId: 'paul-the-apostle' },
  { alias: 'saint paul', figureId: 'paul-the-apostle' },
  { alias: 'st paul the apostle', figureId: 'paul-the-apostle' },
  { alias: 'apostle paul', figureId: 'paul-the-apostle' },

  // Augustus variants (Pantheon: "Augustus")
  { alias: 'augustus caesar', figureId: 'augustus' },
  { alias: 'caesar augustus', figureId: 'augustus' },
  { alias: 'octavian', figureId: 'augustus' },

  // Napoleon variants (Pantheon: "Napoleon")
  { alias: 'napoleon bonaparte', figureId: 'napoleon' },
  { alias: 'napoleon i', figureId: 'napoleon' },
  { alias: 'bonaparte', figureId: 'napoleon' },

  // Cai Lun variants (Pantheon: "Cai Lun")
  { alias: "ts'ai lun", figureId: 'cai-lun' },
  { alias: 'tsai lun', figureId: 'cai-lun' },

  // Ashoka variants (Pantheon: "Ashoka")
  { alias: 'ashoka the great', figureId: 'ashoka' },
  { alias: 'asoka', figureId: 'ashoka' },
  { alias: 'asoka the great', figureId: 'ashoka' },

  // Confucius (already correct in Pantheon)
  { alias: 'kong qiu', figureId: 'confucius' },
  { alias: 'kongzi', figureId: 'confucius' },
  { alias: 'master kong', figureId: 'confucius' },

  // Laozi variants (Pantheon: "Laozi")
  { alias: 'lao tzu', figureId: 'laozi' },
  { alias: 'lao-tzu', figureId: 'laozi' },
  { alias: 'lao tse', figureId: 'laozi' },

  // Ibn Sina / Avicenna (check Pantheon name)
  { alias: 'avicenna', figureId: 'avicenna' },
  { alias: 'ibn sina', figureId: 'avicenna' },

  // Ibn Rushd / Averroes
  { alias: 'averroes', figureId: 'averroes' },
  { alias: 'ibn rushd', figureId: 'averroes' },

  // Qin Shi Huang variants
  { alias: 'qin shi huangdi', figureId: 'qin-shi-huang' },
  { alias: 'shi huangdi', figureId: 'qin-shi-huang' },
  { alias: 'shih huang ti', figureId: 'qin-shi-huang' },
  { alias: 'first emperor', figureId: 'qin-shi-huang' },

  // Wright Brothers
  { alias: 'wright brothers', figureId: 'orville-wright' },
  { alias: 'orville and wilbur wright', figureId: 'orville-wright' },
  { alias: 'wilbur and orville wright', figureId: 'orville-wright' },
  { alias: 'thomas wright / orville wright', figureId: 'orville-wright' },

  // Common short names
  { alias: 'newton', figureId: 'isaac-newton' },
  { alias: 'einstein', figureId: 'albert-einstein' },
  { alias: 'darwin', figureId: 'charles-darwin' },
  { alias: 'marx', figureId: 'karl-marx' },
  { alias: 'shakespeare', figureId: 'william-shakespeare' },
  { alias: 'galileo', figureId: 'galileo-galilei' },
  { alias: 'copernicus', figureId: 'nicolaus-copernicus' },
  { alias: 'michelangelo', figureId: 'michelangelo' },
  { alias: 'leonardo', figureId: 'leonardo-da-vinci' },
  { alias: 'da vinci', figureId: 'leonardo-da-vinci' },
  { alias: 'beethoven', figureId: 'ludwig-van-beethoven' },
  { alias: 'mozart', figureId: 'wolfgang-amadeus-mozart' },
  { alias: 'bach', figureId: 'johann-sebastian-bach' },
  { alias: 'voltaire', figureId: 'voltaire' },
  { alias: 'descartes', figureId: 'ren--descartes' },
  { alias: 'rene descartes', figureId: 'ren--descartes' },
  { alias: 'socrates', figureId: 'socrates' },
  { alias: 'euclid', figureId: 'euclid' },
  { alias: 'euclid of alexandria', figureId: 'euclid' },
  { alias: 'hippocrates', figureId: 'hippocrates' },
  { alias: 'archimedes', figureId: 'archimedes' },
  { alias: 'pythagoras', figureId: 'pythagoras' },
  { alias: 'herodotus', figureId: 'herodotus' },
  { alias: 'homer', figureId: 'homer' },

  // Genghis Khan variants
  { alias: 'chinggis khan', figureId: 'genghis-khan' },
  { alias: 'temujin', figureId: 'genghis-khan' },

  // Julius Caesar
  { alias: 'caesar', figureId: 'julius-caesar' },
  { alias: 'gaius julius caesar', figureId: 'julius-caesar' },

  // Constantine
  { alias: 'constantine', figureId: 'constantine-the-great' },
  { alias: 'constantine i', figureId: 'constantine-the-great' },

  // Charlemagne
  { alias: 'charles the great', figureId: 'charlemagne' },
  { alias: 'karl der grosse', figureId: 'charlemagne' },

  // Alexander
  { alias: 'alexander', figureId: 'alexander-the-great' },
  { alias: 'alexander iii of macedon', figureId: 'alexander-the-great' },

  // Cyrus
  { alias: 'cyrus', figureId: 'cyrus-the-great' },
  { alias: 'cyrus ii', figureId: 'cyrus-the-great' },

  // Simon Bolivar
  { alias: 'bolivar', figureId: 'sim-n-bol-var' },
  { alias: 'simon bolivar', figureId: 'sim-n-bol-var' },
  { alias: 'simón bolívar', figureId: 'sim-n-bol-var' },

  // Gandhi
  { alias: 'gandhi', figureId: 'mahatma-gandhi' },
  { alias: 'mohandas gandhi', figureId: 'mahatma-gandhi' },
  { alias: 'mohandas karamchand gandhi', figureId: 'mahatma-gandhi' },

  // Martin Luther King
  { alias: 'mlk', figureId: 'martin-luther-king-jr' },
  { alias: 'martin luther king', figureId: 'martin-luther-king-jr' },

  // Nelson Mandela
  { alias: 'mandela', figureId: 'nelson-mandela' },

  // Marie Curie
  { alias: 'curie', figureId: 'marie-curie' },
  { alias: 'madame curie', figureId: 'marie-curie' },

  // Tesla
  { alias: 'tesla', figureId: 'nikola-tesla' },

  // Edison
  { alias: 'edison', figureId: 'thomas-edison' },

  // Faraday
  { alias: 'faraday', figureId: 'michael-faraday' },

  // Maxwell
  { alias: 'maxwell', figureId: 'james-clerk-maxwell' },

  // Pasteur
  { alias: 'pasteur', figureId: 'louis-pasteur' },

  // Fleming
  { alias: 'fleming', figureId: 'alexander-fleming' },

  // Watson and Crick
  { alias: 'crick watson', figureId: 'francis-crick' },
  { alias: 'watson and crick', figureId: 'francis-crick' },

  // Turing
  { alias: 'turing', figureId: 'alan-turing' },

  // Hawking
  { alias: 'hawking', figureId: 'stephen-hawking' },

  // Feynman
  { alias: 'feynman', figureId: 'richard-feynman' },

  // Oppenheimer
  { alias: 'oppenheimer', figureId: 'j-robert-oppenheimer' },

  // Tim Berners-Lee
  { alias: 'berners-lee', figureId: 'tim-berners-lee' },

  // Additional common variations from unmatched list
  { alias: 'william harvey', figureId: 'william-harvey' },
  { alias: 'edward jenner', figureId: 'edward-jenner' },
  { alias: 'joseph lister', figureId: 'joseph-lister' },
  { alias: 'oliver cromwell', figureId: 'oliver-cromwell' },
  { alias: 'umar ibn al-khattab', figureId: 'umar' },
  { alias: 'umar', figureId: 'umar' },
  { alias: 'mencius', figureId: 'mencius' },
  { alias: 'st augustine', figureId: 'augustine-of-hippo' },
  { alias: 'saint augustine', figureId: 'augustine-of-hippo' },
  { alias: 'st augustine of hippo', figureId: 'augustine-of-hippo' },
  { alias: 'elizabeth i', figureId: 'elizabeth-i-of-england' },
  { alias: 'queen elizabeth i', figureId: 'elizabeth-i-of-england' },
  { alias: 'akbar', figureId: 'akbar' },
  { alias: 'akbar the great', figureId: 'akbar' },
  { alias: 'louis xiv', figureId: 'louis-xiv-of-france' },
  { alias: 'antony van leeuwenhoek', figureId: 'antonie-van-leeuwenhoek' },
  { alias: 'antonie van leeuwenhoek', figureId: 'antonie-van-leeuwenhoek' },
  { alias: 'louis daguerre', figureId: 'louis-daguerre' },
  { alias: 'thomas paine', figureId: 'thomas-paine' },
  { alias: 'thomas malthus', figureId: 'thomas-robert-malthus' },
  { alias: 'nikolaus otto', figureId: 'nicolaus-otto' },
  { alias: 'urban ii', figureId: 'pope-urban-ii' },
  { alias: 'pope urban ii', figureId: 'pope-urban-ii' },
  { alias: 'b.r. ambedkar', figureId: 'b-r-ambedkar' },
  { alias: 'br ambedkar', figureId: 'b-r-ambedkar' },
  { alias: 'william t.g. morton', figureId: 'william-t-g-morton' },
  { alias: 'isabella i', figureId: 'isabella-i-of-castile' },
  { alias: 'queen isabella i', figureId: 'isabella-i-of-castile' },
];

async function seedAliases() {
  console.log('Seeding name aliases...');

  let inserted = 0;
  let skipped = 0;

  for (const { alias, figureId } of knownAliases) {
    const normalizedAlias = normalizeName(alias);

    try {
      await db.insert(nameAliases)
        .values({ alias: normalizedAlias, figureId })
        .onConflictDoNothing();
      inserted++;
    } catch (e) {
      // Skip if alias already exists or figure doesn't exist
      skipped++;
    }
  }

  console.log(`Seeded ${inserted} aliases (${skipped} skipped/existing)`);
}

seedAliases()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seeding aliases:', err);
    process.exit(1);
  });
