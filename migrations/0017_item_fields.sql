-- A pack's items took their lasting names (version 2, study/pack-format.js): natural is means, nl is words. A correction names its piece by that field.
UPDATE corrections SET path = substr(path, 1, length(path) - 7) || 'means' WHERE path LIKE 'items/%/natural';
UPDATE corrections SET path = substr(path, 1, length(path) - 2) || 'words' WHERE path LIKE 'items/%/nl';
