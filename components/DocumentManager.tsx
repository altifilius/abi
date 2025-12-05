import React from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, File, FolderOpen } from 'lucide-react';
import { ProjectDocument } from '../types';
import { useI18n } from '../i18n';

interface DocumentManagerProps {
  documents: ProjectDocument[];
  onUpload: (id: string, file: File) => void;
}

const DocumentManager: React.FC<DocumentManagerProps> = ({ documents, onUpload }) => {
  const { t } = useI18n();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, docId: string) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(docId, e.target.files[0]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass text-center backdrop-blur-xl group hover:border-blue-400/30 transition-all">
             <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-400 group-hover:scale-110 transition-transform">
                 <FolderOpen size={28} />
             </div>
             <div className="text-3xl font-bold text-white mb-1">{documents.length}</div>
             <div className="text-sm text-text-secondary">{t('documents.totalRequired')}</div>
          </div>
           <div className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass text-center backdrop-blur-xl group hover:border-primary/30 transition-all">
             <div className="w-14 h-14 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-primary shadow-glow-primary group-hover:scale-110 transition-transform">
                 <CheckCircle size={28} />
             </div>
             <div className="text-3xl font-bold text-white mb-1">{documents.filter(d => d.status === 'verified').length}</div>
             <div className="text-sm text-text-secondary">{t('documents.completed')}</div>
          </div>
           <div className="bg-glass-dark p-6 rounded-3xl border border-white/10 shadow-glass text-center backdrop-blur-xl group hover:border-red-400/30 transition-all">
             <div className="w-14 h-14 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-400 group-hover:scale-110 transition-transform">
                 <AlertCircle size={28} />
             </div>
             <div className="text-3xl font-bold text-white mb-1">{documents.filter(d => d.status === 'missing').length}</div>
             <div className="text-sm text-text-secondary">{t('documents.pending')}</div>
          </div>
      </div>

      {/* Checklist */}
      <div className="bg-glass-dark rounded-3xl border border-white/10 shadow-glass overflow-hidden backdrop-blur-xl">
        <div className="px-8 py-6 border-b border-white/10 bg-white/5">
            <h3 className="font-bold text-lg text-white">{t('documents.checklistTitle')}</h3>
        </div>
        
        <div className="divide-y divide-white/10">
            {documents.map((doc) => (
                <div key={doc.id} className="p-6 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="flex items-start gap-4">
                        <div className={`mt-1 w-6 h-6 rounded-full flex items-center justify-center border ${
                            doc.status === 'missing' ? 'border-white/20 bg-white/5' : 'bg-primary border-primary text-background shadow-glow-primary'
                        }`}>
                            {doc.status !== 'missing' && <CheckCircle size={14} />}
                        </div>
                        <div>
                             <h4 className="font-medium text-white flex items-center gap-3">
                                {doc.name}
                                {doc.type === 'required' && <span className="text-[10px] bg-red-500/20 text-red-300 px-2 py-0.5 rounded border border-red-500/30 font-bold uppercase">{t('documents.required')}</span>}
                             </h4>
                             {doc.file ? (
                                 <p className="text-sm text-primary flex items-center gap-2 mt-1">
                                    <File size={14} /> {doc.file.name} <span className="text-text-secondary opacity-60">({(doc.file.size / 1024).toFixed(1)} KB)</span>
                                 </p>
                             ) : (
                                 <p className="text-sm text-text-secondary mt-1 italic opacity-60">{t('documents.notUploaded')}</p>
                             )}
                        </div>
                    </div>

                    <div>
                        <input
                            type="file"
                            id={`file-${doc.id}`}
                            className="hidden"
                            onChange={(e) => handleFileChange(e, doc.id)}
                        />
                        <label 
                            htmlFor={`file-${doc.id}`}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                                doc.status === 'verified'
                                ? 'bg-primary/20 text-primary border border-primary/50'
                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-primary/50'
                            }`}
                        >
                            {doc.status === 'verified' ? t('documents.update') : t('documents.upload')} <Upload size={16} />
                        </label>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default DocumentManager;
