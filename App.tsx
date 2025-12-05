import React, { useState } from 'react';
import Layout from './components/Layout';
import IdeaAgent from './components/IdeaAgent';
import FundMatcher from './components/FundMatcher';
import IncorporationGuide from './components/IncorporationGuide';
import DocumentManager from './components/DocumentManager';
import Dashboard from './components/Dashboard';
import { Project, ProjectStage, FundMatch, ProjectDocument } from './types';

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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [project, setProject] = useState<Project>(INITIAL_PROJECT);

  const handleProjectUpdate = (desc: string) => {
    setProject(prev => ({
      ...prev,
      description: desc,
      stage: ProjectStage.DRAFTING
    }));
    // Optional: Auto-navigate to Matcher after generation
    // setActiveTab('fund-matcher'); 
  };

  const handleMatchesUpdate = (matches: FundMatch[]) => {
    setProject(prev => ({
      ...prev,
      matchedFunds: matches
    }));
  };

  const handleDocUpload = (docId: string, file: File) => {
    setProject(prev => ({
        ...prev,
        documents: prev.documents.map(doc => 
            doc.id === docId ? { ...doc, status: 'verified', file: file } : doc
        )
    }));
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard project={project} onNavigate={setActiveTab} />;
      case 'idea-agent':
        return <IdeaAgent onProjectCreate={handleProjectUpdate} />;
      case 'fund-matcher':
        return <FundMatcher project={project} onUpdateMatches={handleMatchesUpdate} />;
      case 'documents':
        return <DocumentManager documents={project.documents} onUpload={handleDocUpload} />;
      case 'incorporation':
        return <IncorporationGuide />;
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
