-- Reclassify figures with domain='Other' based on occupation

-- Arts
UPDATE figures SET domain = 'Arts' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'film director', 'architect', 'photographer', 'mangaka', 'designer',
  'fashion designer', 'singer', 'rapper', 'film producer', 'choreographer',
  'conductor', 'pianist', 'dancer', 'actor', 'actress', 'composer',
  'painter', 'sculptor', 'musician', 'artist', 'novelist', 'playwright',
  'screenwriter', 'cinematographer', 'animator', 'illustrator', 'cartoonist',
  'director', 'music producer', 'opera singer', 'violinist', 'guitarist'
);

-- Military
UPDATE figures SET domain = 'Military' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'military personnel', 'military officer', 'general', 'admiral',
  'soldier', 'military leader', 'naval officer', 'army officer',
  'fighter pilot', 'military commander'
);

-- Religion
UPDATE figures SET domain = 'Religion' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'buddhist monk', 'catholic priest', 'buddhist nun', 'monk', 'nun',
  'priest', 'rabbi', 'imam', 'religious leader', 'theologian', 'bishop',
  'pope', 'cardinal', 'pastor', 'preacher', 'missionary', 'saint'
);

-- Politics
UPDATE figures SET domain = 'Politics' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'sovereign', 'ruler', 'traditional leader or chief', 'monarch', 'king',
  'queen', 'emperor', 'empress', 'prime minister', 'president', 'minister',
  'politician', 'diplomat', 'statesman', 'revolutionary', 'activist',
  'governor', 'senator', 'mayor', 'chancellor', 'dictator', 'pharaoh',
  'sultan', 'caliph', 'chief', 'tribal leader', 'judge', 'lawyer', 'jurist'
);

-- Economics
UPDATE figures SET domain = 'Economics' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'entrepreneur', 'business executive', 'businessperson', 'banker',
  'investor', 'industrialist', 'merchant', 'trader', 'economist',
  'financier', 'ceo', 'founder', 'investment banker'
);

-- Science
UPDATE figures SET domain = 'Science' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'psychologist', 'psychiatrist', 'anthropologist', 'sociologist',
  'linguist', 'historian', 'cryptographer', 'programmer', 'computer scientist',
  'mathematician', 'physicist', 'chemist', 'biologist', 'geologist',
  'astronomer', 'engineer', 'inventor', 'naturalist', 'archaeologist',
  'paleontologist', 'botanist', 'zoologist', 'neuroscientist'
);

-- Philosophy (includes historians of ideas, translators of philosophical texts)
UPDATE figures SET domain = 'Philosophy' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'philosopher', 'translator', 'scholar', 'intellectual', 'logician',
  'ethicist', 'metaphysician'
);

-- Medicine
UPDATE figures SET domain = 'Medicine' WHERE domain = 'Other' AND LOWER(occupation) IN (
  'physician', 'surgeon', 'doctor', 'nurse', 'medical researcher',
  'epidemiologist', 'pharmacologist', 'pathologist', 'dentist'
);

-- Check results
SELECT domain, COUNT(*) as count FROM figures GROUP BY domain ORDER BY count DESC;
