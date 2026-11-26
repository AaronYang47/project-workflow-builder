/**
 * Annex 1 and 2 of the PROFAB Qualification Form [1.01] v261126, in French and
 * English as printed on the form (generated from S_1.01_QF_V261126_Table_Format.docx).
 */

export type AnnexGroup = { title: [string, string]; items: [string, string][] };

export const QF_ANNEX_1: AnnexGroup[] = [
  {
    title: ["Extérieur", "Exterior"],
    items: [
      ["1. Fenêtres — type, fournisseur, vitrage", "1. Windows — type, supplier, glazing"],
      ["2. Portes extérieures et quincaillerie", "2. Exterior doors and hardware"],
      ["3. Revêtement extérieur", "3. Exterior cladding / siding"],
      ["4. Soffites, fascias et gouttières", "4. Soffit, fascia and gutters"],
      ["5. Moulures / finition extérieures", "5. Exterior trims / finishing"],
    ],
  },
  {
    title: ["Intérieur", "Interior"],
    items: [
      ["1. Tirage de joints, plâtrage et ponçage", "1. Drywall taping, mudding and sanding"],
      ["2. Revêtements de sol et plinthes", "2. Flooring and baseboards"],
      ["3. Portes intérieures et quincaillerie", "3. Interior doors and hardware"],
      ["4. Armoires, comptoirs et meubles-lavabos", "4. Cabinets, countertops and vanities"],
    ],
  },
  {
    title: ["Livraison et chantier", "Delivery and site"],
    items: [
      ["1. Transport / livraison", "1. Transportation / delivery"],
      ["2. Grue / gréage / levage", "2. Crane / rigging / lifting"],
      ["3. Pose des modules / raccords structuraux", "3. Module setting / structural connections"],
      [
        "4. Finition des joints de modules / étanchéité",
        "4. Module joint completion / weatherproofing",
      ],
      ["5. Fondation / ancrage", "5. Foundation / anchorage"],
      ["6. Services du site et raccordements MEP", "6. Site utilities and MEP connections"],
      ["7. Escaliers, rampes, terrasses et garde-corps", "7. Stairs, ramps, decks and guards"],
      ["8. Essais / mise en service", "8. Testing / commissioning"],
    ],
  },
  {
    title: ["Produits et équipements", "Products and equipment"],
    items: [
      [
        "1. Équipement mécanique extérieur (persiennes, grilles, évents)",
        "1. Exterior mechanical equipment (louvers, grilles, vents)",
      ],
      ["2. CVC, VRC/VRE et équipement d’évacuation", "2. HVAC, HRV/ERV and exhaust equipment"],
      ["3. Luminaires extérieurs et couvercles", "3. Exterior light fixtures and covers"],
      ["4. Appareils de plomberie sélectionnés", "4. Selected plumbing fixtures"],
      ["5. Produits coupe-feu et calfeutrage", "5. Fire-stopping products and caulking"],
    ],
  },
];

export const QF_ANNEX_2: AnnexGroup[] = [
  {
    title: ["1. Génie civil", "1. Civil"],
    items: [
      [
        "1.1. Plan d’implantation à jour : limites de propriété, marges de recul, accès et municipalité",
        "1.1. Current site plan: property lines, setbacks, site access and municipality",
      ],
      [
        "1.2. Plan des fondations : position cotée ou géoréférencée et orientation de chaque fondation (référence de grille ou du nord)",
        "1.2. Foundation plan: dimensioned or georeferenced position and orientation of each foundation (grid or north reference)",
      ],
      [
        "1.3. Type de fondation, dimensions et élévation du dessus de fondation",
        "1.3. Foundation type, dimensions and top-of-foundation elevation",
      ],
      [
        "1.4. Élévation du plancher fini, niveaux du terrain et repères",
        "1.4. Finished floor elevation, site grades and benchmarks",
      ],
      [
        "1.5. Détails d’ancrage : lisse d’assise, boulons, attaches",
        "1.5. Anchorage details: sill plate, anchor bolts, hold-downs",
      ],
      [
        "1.6. Points d’entrée des services (eau, égout, électricité, gaz) : position et élévation par rapport aux modules",
        "1.6. Utility entry points (water, sewer, electrical, gas): location and elevation relative to the modules",
      ],
      [
        "1.7. Itinéraire de livraison, emplacement de la grue et séquence de pose",
        "1.7. Delivery route, crane location and setting sequence",
      ],
      [
        "1.8. Escaliers, perrons, rampes et terrasses aux entrées : qui fournit et détails",
        "1.8. Entry stairs, stoops, ramps and decks: who supplies and details",
      ],
      ["1.9. Étude géotechnique et profondeur de gel", "1.9. Geotechnical report and frost depth"],
    ],
  },
  {
    title: ["2. Architecture", "2. Architecture"],
    items: [
      [
        "2.1. Dernier jeu de dessins : plans, élévations, coupes, révision et statut d’émission",
        "2.1. Latest drawing set: plans, elevations, sections, revision and issue status",
      ],
      [
        "2.2. Plans d’étage cotés et superficie de chaque unité",
        "2.2. Dimensioned floor plans and area of each unit",
      ],
      [
        "2.3. Hauteurs de plafond et hauteur d’étage à étage",
        "2.3. Ceiling heights and floor-to-floor height",
      ],
      [
        "2.4. Lignes de division des modules et murs de jonction",
        "2.4. Module split lines and marriage walls",
      ],
      [
        "2.5. Compositions des murs, planchers et toit (isolation, revêtements, finis)",
        "2.5. Wall, floor and roof assemblies (insulation, sheathing, finishes)",
      ],
      [
        "2.6. Type de toit, pente, débords et détails de rive",
        "2.6. Roof type, pitch, overhangs and eave details",
      ],
      [
        "2.7. Tableau des fenêtres et portes extérieures : dimensions, ouvertures brutes, sens d’ouverture, fabricant et modèle",
        "2.7. Window and exterior door schedule: sizes, rough openings, swing, make and model",
      ],
      [
        "2.8. Revêtement extérieur, soffites, fascias, gouttières et moulures : produit et couleur",
        "2.8. Exterior cladding, soffit, fascia, gutters and trim: product and colour",
      ],
      [
        "2.9. Tableau des finis intérieurs : sols, cloisons sèches, peinture, plinthes et moulures",
        "2.9. Interior finish schedule: flooring, drywall, paint, baseboards and trim",
      ],
      [
        "2.10. Portes intérieures et quincaillerie : dimensions, type et sens d’ouverture",
        "2.10. Interior doors and hardware: sizes, type and swing",
      ],
      [
        "2.11. Cuisines et salles de bain : plans, armoires, comptoirs et meubles-lavabos",
        "2.11. Kitchens and bathrooms: layouts, cabinets, countertops and vanities",
      ],
      [
        "2.12. Exigences du code qui touchent les dessins : accessibilité, fenêtres d’évacuation, garde-corps",
        "2.12. Code items that affect the drawings: barrier-free, egress windows, guards",
      ],
      [
        "2.13. Travaux finis en usine et travaux finis au chantier (exclusions)",
        "2.13. Work finished in the factory versus on site (exclusions)",
      ],
      ["2.14. Architecte responsable et coordonnées", "2.14. Responsible architect and contact"],
    ],
  },
  {
    title: ["3. Structure", "3. Structure"],
    items: [
      [
        "3.1. Dessins de structure à jour, révision et sceau de l’ingénieur",
        "3.1. Current structural drawings, revision and engineer’s seal",
      ],
      [
        "3.2. Charges de calcul : neige, vent, séisme et occupation",
        "3.2. Design loads: snow, wind, seismic and occupancy",
      ],
      [
        "3.3. Charpente des planchers et du toit : solives ou fermes, espacement, fabricant",
        "3.3. Floor and roof framing: joists or trusses, spacing, manufacturer",
      ],
      [
        "3.4. Linteaux, poutres et poteaux : dimensions et emplacement",
        "3.4. Headers, beams and posts: sizes and locations",
      ],
      [
        "3.5. Murs porteurs, contreventement et système de résistance latérale",
        "3.5. Bearing walls, shear walls and lateral system",
      ],
      [
        "3.6. Empilement des modules et raccords entre modules",
        "3.6. Module stacking and module-to-module connections",
      ],
      ["3.7. Raccord des modules à la fondation", "3.7. Module-to-foundation connection"],
      [
        "3.8. Points de levage et exigences de transport",
        "3.8. Lifting points and transport requirements",
      ],
      [
        "3.9. Ouvertures et pénétrations dans la charpente (MEP)",
        "3.9. Framing openings and penetrations (MEP)",
      ],
      ["3.10. Ingénieur en structure et coordonnées", "3.10. Structural engineer and contact"],
    ],
  },
  {
    title: ["4. Mécanique", "4. Mechanical"],
    items: [
      [
        "4.1. Dessins de mécanique à jour et consultant responsable",
        "4.1. Current mechanical drawings and responsible consultant",
      ],
      [
        "4.2. Système de chauffage et de climatisation : type, fabricant et modèle",
        "4.2. Heating and cooling system: type, make and model",
      ],
      ["4.3. VRC/VRE : fabricant, modèle et emplacement", "4.3. HRV/ERV: make, model and location"],
      [
        "4.4. Parcours des conduits, retombées et cloisons techniques",
        "4.4. Duct routing, bulkheads and chases",
      ],
      [
        "4.5. Ventilateurs d’extraction et hotte de cuisinière : modèle, diamètre du conduit et sortie",
        "4.5. Exhaust fans and range hood: model, duct size and termination",
      ],
      [
        "4.6. Persiennes, grilles et évents extérieurs : emplacement et dimensions",
        "4.6. Exterior louvers, grilles and vents: locations and sizes",
      ],
      [
        "4.7. Équipement extérieur ou sur balcon : emplacement et qui installe",
        "4.7. Exterior or balcony equipment: location and who installs",
      ],
      ["4.8. Thermostats et commandes : emplacement", "4.8. Thermostats and controls: locations"],
      [
        "4.9. Appareils au gaz (foyer, cuisinière, sécheuse) et évacuation",
        "4.9. Gas appliances (fireplace, range, dryer) and venting",
      ],
      ["4.10. Raccords mécaniques entre modules", "4.10. Mechanical connections between modules"],
    ],
  },
  {
    title: ["5. Électricité", "5. Electrical"],
    items: [
      [
        "5.1. Dessins d’électricité à jour et consultant responsable",
        "5.1. Current electrical drawings and responsible consultant",
      ],
      [
        "5.2. Entrée électrique : capacité, emplacement du compteur et du panneau",
        "5.2. Electrical service: size, meter and panel locations",
      ],
      [
        "5.3. Tableau du panneau et liste des circuits des appareils",
        "5.3. Panel schedule and appliance circuit list",
      ],
      [
        "5.4. Disposition des prises, interrupteurs et luminaires",
        "5.4. Layout of receptacles, switches and light fixtures",
      ],
      [
        "5.5. Tableau des luminaires intérieurs et extérieurs : fabricant et modèle",
        "5.5. Interior and exterior light fixture schedule: make and model",
      ],
      [
        "5.6. Prises et luminaires extérieurs, couvercles et pénétrations",
        "5.6. Exterior receptacles, fixtures, covers and penetrations",
      ],
      ["5.7. Avertisseurs de fumée et de CO : emplacement", "5.7. Smoke and CO alarm locations"],
      [
        "5.8. Basse tension : données, télévision, sonnette, sécurité",
        "5.8. Low voltage: data, TV, doorbell, security",
      ],
      [
        "5.9. Équipements spéciaux : borne de recharge, génératrice, solaire",
        "5.9. Special equipment: EV charger, generator, solar",
      ],
      [
        "5.10. Points de raccordement électrique entre modules",
        "5.10. Electrical connection points between modules",
      ],
    ],
  },
  {
    title: ["6. Plomberie", "6. Plumbing"],
    items: [
      [
        "6.1. Dessins de plomberie à jour et consultant responsable",
        "6.1. Current plumbing drawings and responsible consultant",
      ],
      [
        "6.2. Tableau des appareils : éviers, toilettes, baignoires, douches et robinets (fabricant et modèle)",
        "6.2. Fixture schedule: sinks, toilets, tubs, showers and faucets (make and model)",
      ],
      [
        "6.3. Chauffe-eau : type, capacité, fabricant et emplacement",
        "6.3. Water heater: type, capacity, make and location",
      ],
      [
        "6.4. Matériaux de tuyauterie d’alimentation et de drainage (PEX, cuivre, ABS, PVC)",
        "6.4. Supply and drain piping materials (PEX, copper, ABS, PVC)",
      ],
      [
        "6.5. Emplacement des colonnes et évents coordonné avec la charpente",
        "6.5. Stack and vent locations coordinated with framing",
      ],
      [
        "6.6. Entrée d’eau principale et sortie d’égout : position et élévation",
        "6.6. Main water entry and sewer exit: location and elevation",
      ],
      [
        "6.7. Buanderie, robinets extérieurs et drains de plancher",
        "6.7. Laundry, hose bibs and floor drains",
      ],
      ["6.8. Raccords de plomberie entre modules", "6.8. Plumbing connections between modules"],
      ["6.9. Isolation et protection contre le gel", "6.9. Insulation and freeze protection"],
    ],
  },
  {
    title: ["7. Protection incendie", "7. Fire protection"],
    items: [
      [
        "7.1. Consultant en protection incendie et documents à jour",
        "7.1. Fire protection consultant and current documents",
      ],
      [
        "7.2. Usage, séparations coupe-feu et assemblages cotés (numéros d’homologation)",
        "7.2. Occupancy, fire separations and rated assemblies (listing numbers)",
      ],
      [
        "7.3. Exigences relatives aux gicleurs : Type de système, disposition des têtes et concepteur",
        "7.3. Sprinkler requirements: System type, head layout and designer",
      ],
      [
        "7.4. Alimentation en eau des gicleurs et point d’entrée",
        "7.4. Sprinkler water supply and entry point",
      ],
      [
        "7.5. Alarme incendie et détection : type et emplacement des appareils",
        "7.5. Fire alarm and detection: type and device locations",
      ],
      [
        "7.6. Coupe-feu aux joints de modules et aux pénétrations : systèmes homologués",
        "7.6. Firestopping at module joints and penetrations: listed systems",
      ],
      [
        "7.7. Portes et cadres résistants au feu : emplacement et cote",
        "7.7. Fire-rated doors and frames: locations and rating",
      ],
      [
        "7.8. Approbations du service d’incendie et exigences municipales",
        "7.8. Fire authority approvals and municipal requirements",
      ],
    ],
  },
];
