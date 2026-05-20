(function () {
  const categoriesPool = [
    "Ville déjà visitée",
    "Chose qui sent fort",
    "Nom d'un jeu vidéo",
    "Objet qu'on perd souvent",
    "Plat qui se mange froid",
    "Objet qu'on emporte en voyage",
    "Excuse peu crédible",
    "Lieu où on enlève ses chaussures",
    "Nom d'une boisson chaude",
    "Quelque chose de fragile",
    "Animal qui impressionne",
    "Objet qu'on recharge",
    "Métier qui finit tard",
    "Objet qu'on oublie en partant",
    "Nom d'une île",
    "Chose qu'on offre à quelqu'un",
    "Objet qui roule",
    "Chose qui fait du bruit la nuit",
    "Nom d'un film culte",
    "Endroit où on attend",
    "Chose qu'on garde dans un tiroir",
    "Truc qui pique",
    "Nom d'un dessert",
    "Quelque chose de minuscule",
    "Nom d'un artiste",
    "Objet qu'on trouve dans une salle de bain",
    "Raison de sortir tard",
    "Objet qu'on prête rarement",
    "Nom d'une appli",
    "Chose qui brille",
    "Endroit où il fait humide",
    "Quelque chose qu'on collectionne",
    "Objet qu'on pose sur une table",
    "Nom d'un Pokémon",
    "Quelque chose qui fait rire",
    "Truc qui prend de la place",
    "Nom d'une capitale",
    "Chose qu'on garde pour plus tard",
    "Quelque chose qu'on entend en voiture",
    // Nouvelles catégories
    "Nom d'un sportif",
    "Nom d'une ville française",
    "Nom d'un animal domestique",
    "Nom d'une fleur",
    "Nom d'un instrument de musique",
    "Nom d'un pays",
    "Nom d'une célébrité",
    "Nom d'un personnage de dessin animé",
    "Nom d'une marque",
    "Nom d'un plat cuisiné",
    "Nom d'un métier",
    "Nom d'un objet électronique",
    "Nom d'une série télé",
    "Nom d'un sport",
    "Nom d'un écrivain",
    "Nom d'une chanson connue",
    "Nom d'un acteur ou actrice",
    "Nom d'une couleur",
    "Nom d'un monument",
    "Nom d'une rivière ou d'un lac"
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
        7,
        isFinalRound ? [finalRound.finalCategory] : []
      );

      if (isFinalRound) {
        categories[6] = finalRound.finalCategory;
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