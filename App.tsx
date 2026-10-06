import type React from 'react';
import { useState } from 'react';
import Dashboard from './components/Dashboard';
import DocumentManager from './components/DocumentManager';
import FundMatcher from './components/FundMatcher';
import Help from './components/Help';
import IdeaAgent from './components/IdeaAgent';
import IncorporationGuide from './components/IncorporationGuide';
import Layout from './components/Layout';
import Settings from './components/Settings';
import { useProjectState } from './hooks/useProjectState';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { project, updateDescription, updateMatchedFunds, uploadDocument } = useProjectState();

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard project={project} onNavigate={setActiveTab} />;
      case 'idea-agent':
        return (
          <IdeaAgent
            onProjectCreate={updateDescription}
            projectTitle={project.title}
            projectDescription={project.description}
          />
        );
      case 'fund-matcher':
        return <FundMatcher project={project} onUpdateMatches={updateMatchedFunds} />;
      case 'documents':
        return <DocumentManager documents={project.documents} onUpload={uploadDocument} />;
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
