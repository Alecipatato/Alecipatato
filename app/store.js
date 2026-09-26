// Fichier JSON des abonnés, indexé par leur numéro RappelPro.
'use strict';

const fs = require('node:fs');

function createStore(file, initial = {}) {
  let clients = { ...initial };
  if (file && fs.existsSync(file)) clients = JSON.parse(fs.readFileSync(file, 'utf8'));

  function save() {
    if (!file) return;
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(clients, null, 2));
    fs.renameSync(tmp, file);
  }

  return {
    // Les abonnements annulés restent dans le fichier pour l'historique, mais ne répondent plus.
    get: (number) => (clients[number] && clients[number].active !== false ? clients[number] : undefined),
    find: (pred) => Object.entries(clients).find(([, c]) => pred(c)),
    set(number, client) {
      clients[number] = client;
      save();
    },
    count: () => Object.values(clients).filter((c) => c.active !== false).length,
    active: () => Object.entries(clients).filter(([, c]) => c.active !== false),
  };
}

module.exports = { createStore };
