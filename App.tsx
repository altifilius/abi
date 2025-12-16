import React, { useState } from 'react';
import Layout from './components/Layout';
import IdeaAgent from './components/IdeaAgent';
import FundMatcher from './components/FundMatcher';
import IncorporationGuide from './components/IncorporationGuide';
import DocumentManager from './components/DocumentManager';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Help from './components/Help';
import { Project, ProjectStage, FundMatch, ProjectDocument, ProjectPersistedState } from './types';
import { loadProjectState, saveProjectState } from './services/persistence';

const INITIAL_PROJECT: Project = {
  id: 'proj_001',
  title: 'Untitled R&D Project',
  description: '',
  stage: ProjectStage.IDEA,
  documents: [
    { id: 'd1', name: 'Project Information Form (AGY100)', type: 'required', status: 'missing' },
    { id: 'd2', name: 'Proforma Invoices', type: 'required', status: 'missing' },
    { id: 'd3', name: 'Trade Registry Gazette', type: 'required', status: 'missing' },
    { id: 'd4', name: 'CVs of Personnel', type: 'optional', status: 'missing' }
  ],
  matchedFunds: []
};

const mergePersistedProject = (initial: Project, persisted: ProjectPersistedState | null): Project => {
  if (!persisted || typeof persisted !== 'object') return initial;

  const mergedDocuments = Array.isArray(persisted.documents)
    ? persisted.documents
    : initial.documents;

  const mergedMatches = Array.isArray(persisted.matchedFunds)
    ? persisted.matchedFunds
    : initial.matchedFunds;

  return {
    ...initial,
    description: typeof persisted.description === 'string' ? persisted.description : initial.description,
    documents: mergedDocuments,
    matchedFunds: mergedMatches
  };
};

const stripFileFromDocuments = (docs: ProjectDocument[]) =>
  docs.map(({ id, name, type, status }) => ({ id, name, type, status }));

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [project, setProject] = useState<Project>(() => {
    const persisted = loadProjectState();
    return mergePersistedProject(INITIAL_PROJECT, persisted);
  });

  const handleProjectUpdate = (desc: string) => {
    setProject(prev => {
      const next = {
        ...prev,
        description: desc,
        stage: ProjectStage.DRAFTING
      };
      saveProjectState({ description: next.description });
      return next;
    });
    // Optional: Auto-navigate to Matcher after generation
    // setActiveTab('fund-matcher'); 
  };

  const handleMatchesUpdate = (matches: FundMatch[]) => {
    setProject(prev => {
      const next = {
        ...prev,
        matchedFunds: matches
      };
      saveProjectState({ matchedFunds: next.matchedFunds });
      return next;
    });
  };

  const handleDocUpload = (docId: string, file: File) => {
    setProject(prev => {
      const updatedDocuments = prev.documents.map(doc => 
        doc.id === docId ? { ...doc, status: 'verified', file: file } : doc
      );
      const next = {
        ...prev,
        documents: updatedDocuments
      };
      saveProjectState({ documents: stripFileFromDocuments(next.documents) });
      return next;
    });
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard project={project} onNavigate={setActiveTab} />;
      case 'idea-agent':
        return (
          <IdeaAgent
            onProjectCreate={handleProjectUpdate}
            projectTitle={project.title}
            projectDescription={project.description}
          />
        );
      case 'fund-matcher':
        return <FundMatcher project={project} onUpdateMatches={handleMatchesUpdate} />;
      case 'documents':
        return <DocumentManager documents={project.documents} onUpload={handleDocUpload} />;
      case 'incorporation':
        return <IncorporationGuide />;
      case 'settings':
        return <Settings />;
      case 'help':
        return <Help />;
      default:
        return <Dashboard project={project} onNavigate={setActiveTab} />;
    }
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {renderContent()}
    </Layout>
  );
};

export default App;
