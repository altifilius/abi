import type { Project, Workspace } from '../types';
import FundingCatalog from './FundingCatalog';

export interface FundingScreenProps {
  workspace: Workspace;
  projects: Project[];
  programId?: string;
  callId?: string;
}

export default function FundingScreen(props: FundingScreenProps) {
  return <FundingCatalog {...props} />;
}
