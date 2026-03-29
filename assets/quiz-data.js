(function () {
  const sharedQuestions = [
    {
      id: 1,
      prompt: "Combien d'archipels compte la Polynesie francaise ?",
      choices: ["4", "5", "6", "7"],
      answer: 1,
      fact: "Le territoire rassemble 5 archipels."
    },
    {
      id: 2,
      prompt: "Fakarava appartient a quel archipel ?",
      choices: ["Tuamotu", "Australes", "Gambier", "Marquises"],
      answer: 0,
      fact: "Fakarava fait partie des Tuamotu et figure parmi les atolls les plus celebres du territoire."
    },
    {
      id: 3,
      prompt: "L'altitude du mont Otemanu est la plus proche de ?",
      choices: ["610 m", "727 m", "812 m", "905 m"],
      answer: 1,
      fact: "Le mont Otemanu culmine a environ 727 metres sur Bora Bora."
    },
    {
      id: 4,
      prompt: "Quelle fleur accompagne souvent accueil, fete et naissance ?",
      choices: ["Le tiare Tahiti", "Le tiare apetahi", "Le tipanie", "Le pitate"],
      answer: 0,
      fact: "Le tiare Tahiti est une fleur emblematique tres presente dans les usages locaux."
    },
    {
      id: 5,
      prompt: "Rangiroa est surtout connu comme ?",
      choices: ["Un atoll", "Une ile haute", "Une presqu'ile", "Un motu isole"],
      answer: 0,
      fact: "Rangiroa est un vaste atoll des Tuamotu, celebre pour son lagon."
    },
    {
      id: 6,
      prompt: "De Papeete a Montreal, la distance a vol d'oiseau est la plus proche de ?",
      choices: ["9 400 km", "10 400 km", "11 400 km", "12 400 km"],
      answer: 1,
      fact: "La distance directe entre Papeete et Montreal est d'environ 10 400 kilometres."
    },
    {
      id: 7,
      prompt: "Taiohae est le centre administratif de quelle ile ?",
      choices: ["Nuku Hiva", "Hiva Oa", "Ua Pou", "Tahuata"],
      answer: 0,
      fact: "Taiohae est le chef-lieu de Nuku Hiva, dans l'archipel des Marquises."
    },
    {
      id: 8,
      prompt: "En reo tahiti, le signe apostrophe se nomme ?",
      choices: ["Okina", "Paepae", "Umete", "Tahua"],
      answer: 0,
      fact: "L'okina marque un coup de glotte dans plusieurs langues polynesiennes."
    },
    {
      id: 9,
      prompt: "En novembre, aux iles du Vent, le temps devient plus souvent ?",
      choices: ["Chaud et humide", "Frais et tres sec", "Brumeux et froid", "Stable sans pluie"],
      answer: 0,
      fact: "Novembre correspond souvent a une periode plus chaude et plus humide."
    }
  ];

  const avatars = [
    { id: "dad", name: "Dad", label: "Player A", role: "grand-pere" },
    { id: "mom", name: "Mom", label: "Player B", role: "grand-mere" },
    { id: "siblings", name: "Siblings", label: "Player C", role: "tata-tonton" },
    { id: "friends", name: "Friends", label: "Player D", role: "tata-tonton" }
  ];

  const revealByRole = {
    "grand-pere": "Felicitations ! Tu vas etre un merveilleux grand-pere.",
    "grand-mere": "Felicitations ! Tu vas etre une formidable grand-mere.",
    "tata-tonton": "Felicitations ! Tu vas etre un tonton ou tata en or."
  };

  window.quizContent = {
    questions: sharedQuestions,
    avatars,
    result: {
      eyebrow: "Resultat",
      lead: "Ton parcours est termine.",
      outro: "Merci d'avoir joue cette manche jusqu'au bout."
    },
    revealByRole
  };
})();