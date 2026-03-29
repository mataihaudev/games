(function () {
  const categoriesPool = [
    "Ville deja visitee",
    "Chose qui sent fort",
    "Nom d'un jeu video",
    "Mot qu'on entend au marche",
    "Objet qu'on perd souvent",
    "Plat qui se mange froid",
    "Truc qu'on emporte en voyage",
    "Excuse peu credible",
    "Lieu ou on enleve ses chaussures",
    "Nom d'une boisson chaude",
    "Quelque chose de fragile",
    "Mot qu'on dit en retard",
    "Animal qui impressionne",
    "Chose qu'on colle sur un frigo",
    "Objet qu'on recharge",
    "Mot qu'on voit a l'aeroport",
    "Metier qui finit tard",
    "Truc qu'on oublie en partant",
    "Nom d'une ile",
    "Chose qu'on offre a quelqu'un",
    "Mot relie a la pluie",
    "Objet qui roule",
    "Chose qui fait du bruit la nuit",
    "Nom d'un film culte",
    "Endroit ou on attend",
    "Mot qu'on crie dans un stade",
    "Chose qu'on garde dans un tiroir",
    "Truc qui pique",
    "Nom d'un dessert",
    "Quelque chose de minuscule",
    "Mot qui rassure",
    "Nom d'un artiste",
    "Truc qu'on trouve dans une salle de bain",
    "Raison de sortir tard",
    "Mot qu'on lit sur une carte",
    "Objet qu'on prete rarement",
    "Nom d'une appli",
    "Chose qui brille",
    "Endroit ou il fait humide",
    "Mot relie a un souvenir",
    "Quelque chose qu'on collectionne",
    "Mot qu'on associe a une fete",
    "Objet qu'on pose sur une table",
    "Nom d'un pokemon",
    "Quelque chose qui fait rire",
    "Truc qui prend de la place",
    "Nom d'une capitale",
    "Chose qu'on garde pour plus tard",
    "Mot qu'on dit en entrant",
    "Quelque chose qu'on entend en voiture"
  ];

  const alphabet = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "V"];

  const finalRound = {
    forcedLetter: "B",
    finalCategory: "Quelque chose qu'on attend",
    suggestedAnswer: "Bebe",
    inputHint: "Pense a quelque chose qu'on attend et qui commence par B.",
    announcementTitle: "Un bebe arrive dans la famille",
    announcementCopy: "La reponse finale etait tout simplement : Bebe."
  };

  function sample(array, count, excludedValues) {
    const excluded = new Set(excludedValues || []);
    const pool = array.filter((item) => !excluded.has(item));
    const values = [];

    while (values.length < count && pool.length > 0) {
      const index = Math.floor(Math.random() * pool.length);
      values.push(pool.splice(index, 1)[0]);
    }

    return values;
  }

  function generateRounds() {
    const rounds = [];
    const usedLetters = new Set([finalRound.forcedLetter]);

    for (let index = 0; index < 3; index += 1) {
      const isFinalRound = index === 2;
      const letter = isFinalRound
        ? finalRound.forcedLetter
        : sample(alphabet, 1, Array.from(usedLetters))[0] || alphabet[index];

      usedLetters.add(letter);

      const categories = sample(
        categoriesPool,
        10,
        isFinalRound ? [finalRound.finalCategory] : []
      );

      if (isFinalRound) {
        categories[9] = finalRound.finalCategory;
      }

      rounds.push({
        roundNumber: index + 1,
        letter,
        categories
      });
    }

    return rounds;
  }

  window.wordGameData = {
    categoriesPool,
    alphabet,
    finalRound,
    generateRounds
  };
})();