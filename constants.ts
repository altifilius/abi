import rawFunds from './data/funds.json';
import type { Fund, IncorporationStep } from './types';

export const FUNDS: Fund[] = rawFunds as Fund[];

export const INCORPORATION_STEPS: IncorporationStep[] = [
  {
    id: '1',
    title: 'Determine Company Type',
    description:
      'Decide between Limited Liability (Ltd.) or Joint Stock (A.Ş.). For most startups, A.Ş. is preferred for investment readiness.',
    completed: false,
    category: 'legal',
  },
  {
    id: '2',
    title: 'Draft Articles of Association',
    description: 'Prepare MERSIS draft defining scope, capital, and shareholders.',
    completed: false,
    category: 'legal',
  },
  {
    id: '3',
    title: 'Notary Approval & Trade Registry',
    description:
      'Sign documents at the notary and submit to the Trade Registry Office (Ticaret Sicil).',
    completed: false,
    category: 'legal',
  },
  {
    id: '4',
    title: 'Tax Office Registration',
    description: 'Obtain Tax ID and set up e-Notification system.',
    completed: false,
    category: 'tax',
  },
  {
    id: '5',
    title: 'Bank Account Opening',
    description: 'Open a commercial bank account and deposit 1/4 of capital (if A.Ş.).',
    completed: false,
    category: 'compliance',
  },
  {
    id: '6',
    title: 'SGK (Social Security) Registration',
    description: 'Register the company and employees with the Social Security Institution.',
    completed: false,
    category: 'compliance',
  },
];

// Local asset avoids leaking visitors' IP addresses to an avatar service.
export const ABI_AVATAR_URL = '/abi-avatar.svg';
