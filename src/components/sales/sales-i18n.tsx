"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { QF_LABELS, type Lang } from "@/lib/qf-labels";
import { SalesApiError } from "./sales-api";

/**
 * Sales site wording in English and French. The language follows the phone's
 * settings until the person picks one with the EN / FR switch, which this
 * phone then remembers.
 */

const en = {
  brand: "PROFAB Qualification",
  salesIntake: "Sales intake",
  signIn: "Sign in",
  createAccount: "Create account",
  yourName: "Your name",
  email: "Email",
  password: "Password",
  passwordNew: "Password (12+ characters)",
  pleaseWait: "Please wait…",
  signOut: "Sign out",
  signedInAs: (name: string) => `Signed in as ${name}`,
  enterCode: "Enter your access code",
  codeHelp: "Your team gives you an 8-character code. You only enter it once.",
  accessCode: "Access code",
  checking: "Checking…",
  continue: "Continue",
  teamAccount: "This is a team account.",
  teamAccountHelp:
    "The Sales site is for Sales accounts. Open the main app to work on projects, or sign out and sign in with a Sales account.",
  openApp: "Open the app",
  justNow: "just now",
  minutesAgo: (n: number) => `${n} min ago`,
  hoursAgo: (n: number) => `${n} h ago`,
  newProject: "New project",
  noTemplate: "New projects open once your team chooses a project template.",
  notSubmitted: "Not submitted yet",
  newProjectDraft: (when: string) => `New project · draft saved ${when}`,
  projects: "Projects",
  searchProjects: "Search projects",
  searchPlaceholder: "Search by project name",
  draftNotSubmitted: (when: string) => `Draft saved ${when} · not submitted`,
  noMatch: "No project matches this name.",
  noProjects: "No projects yet.",
  tryAgain: "Try again",
  language: "Language",

  // Form shell
  backToProjects: "Back to projects",
  formName: "Qualification Form [1.01]",
  saving: "Saving",
  saved: "Saved",
  savedOnPhone: "On this phone",
  stepOf: (step: number, total: number, title: string) => `Step ${step} of ${total} · ${title}`,
  doneCount: (done: number, total: number) => `${done}/${total} done`,
  formSteps: "Form steps",
  steps: {
    project: "Project",
    building: "Building",
    people: "People",
    consultants: "Consultants",
    commercial: "Budget & dates",
    documents: "Documents",
    technical: "Technical notes",
    open: "Open items",
    review: "Review",
  } as Record<string, string>,
  back: "Back",
  next: "Next",
  updating: (rev: string) => `Updating Rev ${rev}`,
  updatingHelp: (by: string, date: string, next: string) =>
    `The answers from the last submission (${by}, ${date}) are already filled in. Change only what is new — every change is marked and recorded as Rev ${next}.`,
  projectName: "Project name",
  projectNamePlaceholder: "e.g. Maison Laurier — Phase 2",
  fromTemplate: "The project is created from your team's template when you submit.",
  project: "Project",
  jobNumber: "Job number",
  jobNumberPlaceholder: "5 digits, e.g. 26014",
  jobNumberEmpty: "Leave it empty if there is no job number yet.",
  jobNumberBad: "The Job number has 5 digits.",
  changed: "Changed",
  intro:
    "Answer what you know and leave the rest empty. Everything saves as you type, so you can stop and come back any time. Nothing reaches the team until you press Submit.",
  noJob: "No Job number yet",
  job: (n: string) => `Job ${n}`,
  updateChanges: (n: number, rev: string) =>
    `This update changes ${n} ${n === 1 ? "answer" : "answers"} (Rev ${rev})`,
  nothingChanged: (rev: string) => `Nothing has changed since Rev ${rev}`,
  changeFirst: "Change an answer before submitting an update.",
  empty: "empty",
  removed: "removed",
  stillEmpty: (n: number) => `${n} ${n === 1 ? "answer" : "answers"} still empty`,
  stillEmptyHelp: "You can submit now and fill them in later. Tap one to go to it.",
  allFilled: "Every answer is filled in.",
  needName: "Enter the project name on the first step.",
  fixJob: "Fix the Job number on the first step.",
  openThatProject: "Open that project",
  submitting: "Submitting…",
  submitUpdate: (rev: string) => `Submit update (Rev ${rev})`,
  submit: "Submit to the technical team",
  pdfFirst: "Want to check the PDF first? It shows what you have filled in so far.",
  submitted: "Submitted",
  submittedHelp: "The technical team can see it now. Make the PDF to send it by email.",
  generatePdf: "Generate PDF",
  makingPdf: "Making the PDF…",
  share: "Share",
  save: "Save",
  makeAgain: "Make it again",
  pdfFailed: "Could not make the PDF. Please try again.",
  newProjectTitle: "New project",

  // Questions
  answered: "Answered",
  notAnswered: "Not answered yet",
  yes: "Yes",
  no: "No",
  haveIt: "Have it",
  notYet: "Not yet",
  q1: "Project name",
  q1Placeholder: "Name used by the client",
  q2: "Full project address",
  q2Placeholder: "Street, city, province, postal code",
  q5: "Main use of the building",
  q5Hint: "Pick the one main occupancy group.",
  q6: "Approximate gross floor area",
  q6Hint: "All levels together.",
  sqft: "sq. ft.",
  q3: "Who are the project parties?",
  q3Hint: "At least one company, with a contact for each company you enter.",
  parties: { owner: "Owner", gc: "General contractor", client: "Our client (PROFAB)" },
  company: "Company",
  contactPlaceholder: "Contact: name, email or phone",
  q4: "Main contact for the project",
  name: "Name",
  companyRole: "Company & role",
  companyRolePlaceholder: "e.g. Laurier inc. — owner's rep",
  phone: "Phone",
  q7: "Responsible consultants",
  q7Hint: "For each discipline: a name or company, and how to reach them. Tap to open.",
  notFilled: "Not filled in",
  emailOrPhone: "Email or phone",
  unknown: "Unknown",
  notApplicable: "N/A",
  consultantUnknown: "Unknown",
  consultantNa: "N/A — no consultant",
  consultantStatusHelp: "Tap again to enter a name instead.",
  q8: "Is there a project budget?",
  totalBudget: "Total budget (CAD)",
  budgetBad: "Use numbers only, e.g. 1,250,000",
  q9: "Deposit received (CSA or PCS)?",
  q9Loi: "This project goes through an LOI, which has no deposit.",
  q11: "Target dates",
  q11Hint: "Best guess is fine. Tap a date to pick it.",
  q12: "Which documents do you have?",
  q12Hint: "Where a document is, add the folder, link or email date.",
  locationPlaceholder: "Folder, link or email date",
  markRestNotYet: "Mark the rest as “Not yet”",
  q13: "Latest drawings",
  q13Hint: "Name, revision, issue status and where to find them.",
  drawingSet: (n: number) => `Drawing set ${n}`,
  deleteDrawing: (n: number) => `Delete drawing set ${n}`,
  drawingName: "Drawing name / set",
  rev: "Rev #",
  exactLocation: "Exact folder, link or email",
  addDrawing: "Add a drawing set",
  bDisciplines: "What did the client mention, by discipline?",
  bDisciplinesHint:
    "One short line per item, including what the client is still considering. Tap a suggestion to add it.",
  nothingToNote: "Nothing to note",
  nothingToNoteFor: (discipline: string) => `Nothing to note for ${discipline.toLowerCase()}`,
  items: (n: number) => `${n} ${n === 1 ? "item" : "items"}`,
  item: "Item",
  details: "Details, or what the client is still considering",
  addItem: "Add an item",
  suggestions: "Suggestions",
  bSpecial: "Special products and items",
  bSpecialHint:
    "Anything that changes PROFAB's scope, by us or by others. Must match the options in the Preliminary Estimation.",
  noSpecial: "No special products or items",
  specialDescription: "Description (make, model, spec)",
  relatedFiles: "Related files (optional)",
  addSpecial: "Add a special item",
  cRfis: "Missing information and next actions",
  cRfisHint: "What is still missing, who asked for it and by when.",
  rfiPlaceholder: "What is missing (drawing, spec, decision…)",
  sentBy: "Sent by",
  addRfi: "Add a missing item",

  errors: {
    badLogin: "Incorrect email or password.",
    accountExists: "An account already exists for this email. Sign in.",
    registerInvalid: "Enter a valid email, your name, and a password of 12+ characters.",
    tooMany: "Too many attempts. Please try again later.",
    codeInvalid: "This access code is not valid. Check it with your team.",
    codeLength: "The access code has 8 letters and numbers.",
    nameTaken: "A project with this name already exists. Choose it from the list instead.",
    noTemplate: "New projects are not open yet: the team has not chosen a template.",
    offline: "No connection. Check your network and try again.",
    generic: "Something went wrong. Please try again.",
  },
};

export type SalesStrings = typeof en;

const fr: SalesStrings = {
  brand: "Qualification PROFAB",
  salesIntake: "Qualification des ventes",
  signIn: "Connexion",
  createAccount: "Créer un compte",
  yourName: "Votre nom",
  email: "Courriel",
  password: "Mot de passe",
  passwordNew: "Mot de passe (12 caractères ou plus)",
  pleaseWait: "Un instant…",
  signOut: "Déconnexion",
  signedInAs: (name) => `Connecté : ${name}`,
  enterCode: "Entrez votre code d’accès",
  codeHelp: "Votre équipe vous donne un code de 8 caractères. Vous ne l’entrez qu’une fois.",
  accessCode: "Code d’accès",
  checking: "Vérification…",
  continue: "Continuer",
  teamAccount: "Ceci est un compte d’équipe.",
  teamAccountHelp:
    "Le site des ventes est réservé aux comptes Ventes. Ouvrez l’application pour travailler sur les projets, ou déconnectez-vous et connectez-vous avec un compte Ventes.",
  openApp: "Ouvrir l’application",
  justNow: "à l’instant",
  minutesAgo: (n) => `il y a ${n} min`,
  hoursAgo: (n) => `il y a ${n} h`,
  newProject: "Nouveau projet",
  noTemplate:
    "Les nouveaux projets seront possibles quand votre équipe aura choisi un modèle de projet.",
  notSubmitted: "Pas encore soumis",
  newProjectDraft: (when) => `Nouveau projet · brouillon enregistré ${when}`,
  projects: "Projets",
  searchProjects: "Rechercher des projets",
  searchPlaceholder: "Rechercher par nom de projet",
  draftNotSubmitted: (when) => `Brouillon enregistré ${when} · non soumis`,
  noMatch: "Aucun projet ne correspond à ce nom.",
  noProjects: "Aucun projet pour l’instant.",
  tryAgain: "Réessayer",
  language: "Langue",

  backToProjects: "Retour aux projets",
  formName: "Formulaire de qualification [1.01]",
  saving: "Enregistrement",
  saved: "Enregistré",
  savedOnPhone: "Sur ce téléphone",
  stepOf: (step, total, title) => `Étape ${step} de ${total} · ${title}`,
  doneCount: (done, total) => `${done}/${total} faites`,
  formSteps: "Étapes du formulaire",
  steps: {
    project: "Projet",
    building: "Bâtiment",
    people: "Intervenants",
    consultants: "Consultants",
    commercial: "Budget et dates",
    documents: "Documents",
    technical: "Notes techniques",
    open: "En suspens",
    review: "Révision",
  },
  back: "Retour",
  next: "Suivant",
  updating: (rev) => `Mise à jour de la rév. ${rev}`,
  updatingHelp: (by, date, next) =>
    `Les réponses de la dernière soumission (${by}, ${date}) sont déjà remplies. Modifiez seulement ce qui est nouveau — chaque modification est marquée et enregistrée comme rév. ${next}.`,
  projectName: "Nom du projet",
  projectNamePlaceholder: "ex. Maison Laurier — Phase 2",
  fromTemplate: "Le projet est créé à partir du modèle de votre équipe quand vous soumettez.",
  project: "Projet",
  jobNumber: "Numéro de projet",
  jobNumberPlaceholder: "5 chiffres, ex. 26014",
  jobNumberEmpty: "Laissez vide s’il n’y a pas encore de numéro.",
  jobNumberBad: "Le numéro de projet a 5 chiffres.",
  changed: "Modifié",
  intro:
    "Répondez à ce que vous savez et laissez le reste vide. Tout s’enregistre pendant que vous tapez : vous pouvez arrêter et revenir n’importe quand. Rien n’est envoyé à l’équipe avant que vous appuyiez sur Soumettre.",
  noJob: "Pas encore de numéro de projet",
  job: (n) => `Projet ${n}`,
  updateChanges: (n, rev) =>
    `Cette mise à jour modifie ${n} ${n === 1 ? "réponse" : "réponses"} (rév. ${rev})`,
  nothingChanged: (rev) => `Rien n’a changé depuis la rév. ${rev}`,
  changeFirst: "Modifiez une réponse avant de soumettre une mise à jour.",
  empty: "vide",
  removed: "retiré",
  stillEmpty: (n) => `${n} ${n === 1 ? "réponse encore vide" : "réponses encore vides"}`,
  stillEmptyHelp:
    "Vous pouvez soumettre maintenant et compléter plus tard. Touchez-en une pour y aller.",
  allFilled: "Toutes les réponses sont remplies.",
  needName: "Entrez le nom du projet à la première étape.",
  fixJob: "Corrigez le numéro de projet à la première étape.",
  openThatProject: "Ouvrir ce projet",
  submitting: "Envoi…",
  submitUpdate: (rev) => `Soumettre la mise à jour (rév. ${rev})`,
  submit: "Soumettre à l’équipe technique",
  pdfFirst: "Voir le PDF d’abord? Il montre ce que vous avez rempli jusqu’ici.",
  submitted: "Soumis",
  submittedHelp:
    "L’équipe technique peut le voir maintenant. Créez le PDF pour l’envoyer par courriel.",
  generatePdf: "Créer le PDF",
  makingPdf: "Création du PDF…",
  share: "Partager",
  save: "Enregistrer",
  makeAgain: "Le recréer",
  pdfFailed: "Impossible de créer le PDF. Réessayez.",
  newProjectTitle: "Nouveau projet",

  answered: "Répondu",
  notAnswered: "Pas encore répondu",
  yes: "Oui",
  no: "Non",
  haveIt: "Je l’ai",
  notYet: "Pas encore",
  q1: "Nom du projet",
  q1Placeholder: "Nom utilisé par le client",
  q2: "Adresse complète du projet",
  q2Placeholder: "Rue, ville, province, code postal",
  q5: "Usage principal du bâtiment",
  q5Hint: "Choisissez le groupe d’usage principal.",
  q6: "Superficie brute totale approximative",
  q6Hint: "Tous les niveaux ensemble.",
  sqft: "pi²",
  q3: "Qui sont les parties au projet?",
  q3Hint: "Au moins une entreprise, avec une personne-ressource pour chaque entreprise.",
  parties: { owner: "Propriétaire", gc: "Entrepreneur général", client: "Notre client (PROFAB)" },
  company: "Entreprise",
  contactPlaceholder: "Personne-ressource : nom, courriel ou téléphone",
  q4: "Personne-ressource principale",
  name: "Nom",
  companyRole: "Entreprise et rôle",
  companyRolePlaceholder: "ex. Laurier inc. — représentant du propriétaire",
  phone: "Téléphone",
  q7: "Consultants responsables",
  q7Hint:
    "Pour chaque discipline : un nom ou une entreprise, et comment les joindre. Touchez pour ouvrir.",
  notFilled: "Non rempli",
  emailOrPhone: "Courriel ou téléphone",
  unknown: "Inconnu",
  notApplicable: "S.O.",
  consultantUnknown: "Inconnu",
  consultantNa: "S.O. — aucun consultant",
  consultantStatusHelp: "Touchez de nouveau pour plutôt entrer un nom.",
  q8: "Un budget de projet est-il établi?",
  totalBudget: "Budget total (CAD)",
  budgetBad: "Chiffres seulement, ex. 1 250 000",
  q9: "Dépôt reçu (CSA ou PCS)?",
  q9Loi: "Ce projet passe par une LOI, sans dépôt.",
  q11: "Dates cibles",
  q11Hint: "Une estimation suffit. Touchez une date pour la choisir.",
  q12: "Quels documents avez-vous?",
  q12Hint: "Pour chaque document, indiquez le dossier, le lien ou la date du courriel.",
  locationPlaceholder: "Dossier, lien ou date du courriel",
  markRestNotYet: "Marquer le reste « Pas encore »",
  q13: "Derniers dessins",
  q13Hint: "Nom, révision, statut d’émission et où les trouver.",
  drawingSet: (n) => `Jeu de dessins ${n}`,
  deleteDrawing: (n) => `Supprimer le jeu de dessins ${n}`,
  drawingName: "Nom du dessin / jeu",
  rev: "N° rév.",
  exactLocation: "Dossier, lien ou courriel exact",
  addDrawing: "Ajouter un jeu de dessins",
  bDisciplines: "Qu’a mentionné le client, par discipline?",
  bDisciplinesHint:
    "Une ligne concise par élément, y compris ce que le client envisage encore. Touchez une suggestion pour l’ajouter.",
  nothingToNote: "Rien à signaler",
  nothingToNoteFor: (discipline) => `Rien à signaler en ${discipline.toLowerCase()}`,
  items: (n) => `${n} ${n === 1 ? "élément" : "éléments"}`,
  item: "Élément",
  details: "Détails, ou ce que le client envisage encore",
  addItem: "Ajouter un élément",
  suggestions: "Suggestions",
  bSpecial: "Produits et éléments particuliers",
  bSpecialHint:
    "Tout ce qui touche la portée de PROFAB, par nous ou par d’autres. Doit correspondre aux options de l’estimation préliminaire.",
  noSpecial: "Aucun produit ou élément particulier",
  specialDescription: "Description (marque, modèle, devis)",
  relatedFiles: "Fichiers associés (facultatif)",
  addSpecial: "Ajouter un élément particulier",
  cRfis: "Information manquante et prochaines actions",
  cRfisHint: "Ce qui manque encore, qui l’a demandé et pour quand.",
  rfiPlaceholder: "Ce qui manque (dessin, devis, décision…)",
  sentBy: "Envoyé par",
  addRfi: "Ajouter un élément manquant",

  errors: {
    badLogin: "Courriel ou mot de passe incorrect.",
    accountExists: "Un compte existe déjà pour ce courriel. Connectez-vous.",
    registerInvalid:
      "Entrez un courriel valide, votre nom et un mot de passe d’au moins 12 caractères.",
    tooMany: "Trop de tentatives. Réessayez plus tard.",
    codeInvalid: "Ce code d’accès n’est pas valide. Vérifiez-le avec votre équipe.",
    codeLength: "Le code d’accès a 8 lettres et chiffres.",
    nameTaken: "Un projet porte déjà ce nom. Choisissez-le plutôt dans la liste.",
    noTemplate: "Les nouveaux projets ne sont pas encore possibles : aucun modèle choisi.",
    offline: "Pas de connexion. Vérifiez votre réseau et réessayez.",
    generic: "Une erreur s’est produite. Réessayez.",
  },
};

const STRINGS: Record<Lang, SalesStrings> = { en, fr };
const STORAGE_KEY = "sales-language";

/** French when the phone prefers French, English otherwise. */
export function phoneLanguage(): Lang {
  if (typeof navigator === "undefined") return "en";
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  const first = list.find((tag) => /^(en|fr)\b/i.test(tag ?? ""));
  return first?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

function storedLanguage(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "fr" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

const LangContext = createContext<{ lang: Lang; setLang: (lang: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function SalesLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  useEffect(() => {
    // Read after mount: the page is pre-rendered without the phone's settings.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLangState(storedLanguage() ?? phoneLanguage());
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang === "fr" ? "fr-CA" : "en";
  }, [lang]);
  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered on this phone; still switched for now.
    }
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export const useSalesLang = () => useContext(LangContext).lang;

/** This page's words, and the form's own labels, in the chosen language. */
export function useT() {
  const { lang } = useContext(LangContext);
  return { t: STRINGS[lang], labels: QF_LABELS[lang], lang };
}

export const localeOf = (lang: Lang) => (lang === "fr" ? "fr-CA" : "en-CA");

/** EN / FR switch. */
export function LanguageSwitch({ compact = false }: { compact?: boolean }) {
  const { lang, setLang } = useContext(LangContext);
  return (
    <div
      role="group"
      aria-label={STRINGS[lang].language}
      data-sales-language={lang}
      className="inline-flex shrink-0 rounded-full border border-[#d5dbe4] bg-white p-0.5"
    >
      {(["en", "fr"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={lang === option}
          lang={option}
          onClick={() => setLang(option)}
          className={cn(
            "rounded-full font-semibold uppercase",
            compact ? "h-7 px-2 text-[11px]" : "h-8 px-2.5 text-xs",
            lang === option ? "bg-[#245e9b] text-white" : "text-[#475467]",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

/** Server messages in the chosen language (unknown ones pass through). */
export function errorText(caught: unknown, t: SalesStrings) {
  if (!(caught instanceof Error)) return t.errors.generic;
  const code = caught instanceof SalesApiError ? caught.code : undefined;
  const status = caught instanceof SalesApiError ? caught.status : undefined;
  const message = caught.message;
  if (code === "NAME_TAKEN") return t.errors.nameTaken;
  if (status === 0) return t.errors.offline;
  if (status === 429) return t.errors.tooMany;
  const known: [RegExp, string][] = [
    [/incorrect email or password/i, t.errors.badLogin],
    [/account already exists/i, t.errors.accountExists],
    [/enter a valid email/i, t.errors.registerInvalid],
    [/access code is not valid/i, t.errors.codeInvalid],
    [/access code has 8/i, t.errors.codeLength],
    [/new projects are not open yet/i, t.errors.noTemplate],
  ];
  return known.find(([pattern]) => pattern.test(message))?.[1] ?? message;
}
