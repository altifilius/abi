import { Fund, IncorporationStep } from './types';

export const FUNDS: Fund[] = [
  {
    id: 'tubitak-1501',
    code: '1501',
    name: 'Industrial R&D Projects Grant Programme',
    institution: 'TUBITAK',
    description: 'Supports R&D projects of SMEs and large companies. No budget limit.',
    maxBudget: 'Unlimited',
    supportRate: '75% (SME), 60% (Large)'
  },
  {
    id: 'tubitak-1507',
    code: '1507',
    name: 'SME R&D Start-up Support Programme',
    institution: 'TUBITAK',
    description: 'For SMEs submitting their first few R&D projects. Max 3 projects.',
    maxBudget: '1.200.000 TL',
    supportRate: '75%'
  },
  {
    id: 'kosgeb-arge',
    code: 'AR-GE',
    name: 'KOSGEB R&D, P&D and Innovation Support',
    institution: 'KOSGEB',
    description: 'Supports new product development and innovation for SMEs.',
    maxBudget: '1.100.000 TL',
    supportRate: '75%'
  },
  {
    id: 'tubitak-1512',
    code: '1512',
    name: 'Bigg - Entrepreneurship Support Programme',
    institution: 'TUBITAK',
    description: 'Grant for individual entrepreneurs to turn their idea into a startup.',
    maxBudget: '900.000 TL (Equity-free)',
    supportRate: '100%'
  }
];

export const INCORPORATION_STEPS: IncorporationStep[] = [
  {
    id: '1',
    title: 'Determine Company Type',
    description: 'Decide between Limited Liability (Ltd.) or Joint Stock (A.Ş.). For most startups, A.Ş. is preferred for investment readiness.',
    completed: false,
    category: 'legal'
  },
  {
    id: '2',
    title: 'Draft Articles of Association',
    description: 'Prepare MERSIS draft defining scope, capital, and shareholders.',
    completed: false,
    category: 'legal'
  },
  {
    id: '3',
    title: 'Notary Approval & Trade Registry',
    description: 'Sign documents at the notary and submit to the Trade Registry Office (Ticaret Sicil).',
    completed: false,
    category: 'legal'
  },
  {
    id: '4',
    title: 'Tax Office Registration',
    description: 'Obtain Tax ID and set up e-Notification system.',
    completed: false,
    category: 'tax'
  },
  {
    id: '5',
    title: 'Bank Account Opening',
    description: 'Open a commercial bank account and deposit 1/4 of capital (if A.Ş.).',
    completed: false,
    category: 'compliance'
  },
  {
    id: '6',
    title: 'SGK (Social Security) Registration',
    description: 'Register the company and employees with the Social Security Institution.',
    completed: false,
    category: 'compliance'
  }
];

// Default avatar uses Gravatar identicon; replace the hash or query params to personalize.
export const ABI_AVATAR_URL = "https://www.gravatar.com/avatar/?d=identicon&s=160";
