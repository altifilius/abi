const ACTIVITY_LABELS: Record<string, [string, string]> = {
  'workspace.created': ['Çalışma alanı oluşturuldu', 'Workspace created'],
  'workspace.updated': ['Çalışma alanı güncellendi', 'Workspace updated'],
  'project.created': ['Proje oluşturuldu', 'Project created'],
  'project.updated': ['Proje güncellendi', 'Project updated'],
  'project.confirmed': ['Proje profili onaylandı', 'Project profile confirmed'],
  'project.deleted': ['Proje silindi', 'Project deleted'],
  'project.draft_exported': ['Genel proje taslağı indirildi', 'General project draft exported'],
  'application.created': ['Başvuru taslağı oluşturuldu', 'Application draft created'],
  'application.edited': ['Başvuru güncellendi', 'Application updated'],
  'application.written': ['Başvuru metni hazırlandı', 'Application text prepared'],
  'application.review_requested': ['Başvuru incelemesi istendi', 'Application review requested'],
  'application.reviewed': ['Başvuru incelemesi tamamlandı', 'Application reviewed'],
  'application.exported': ['Başvuru paketi indirildi', 'Application package exported'],
  'document.uploaded': ['Belge yüklendi', 'Document uploaded'],
  'document.processed': ['Belge işlendi', 'Document processed'],
  'document.reviewed': ['Belge incelendi', 'Document reviewed'],
  'document.analyzed': ['Belgeden profil önerisi çıkarıldı', 'Document profile proposal created'],
  'task.created': ['Görev oluşturuldu', 'Task created'],
  'task.updated': ['Görev güncellendi', 'Task updated'],
  'task.due': ['Görevin son tarihi yaklaşıyor', 'Task deadline approaching'],
  'comment.created': ['Yorum eklendi', 'Comment added'],
  'funding.evaluated': ['Uygunluk değerlendirildi', 'Eligibility evaluated'],
  'funding.reviewed': ['Uygunluk koşulu incelendi', 'Eligibility condition reviewed'],
  'deadline.due': ['Çağrının son tarihi yaklaşıyor', 'Call deadline approaching'],
  'member.invited': ['Ekip daveti gönderildi', 'Team invitation sent'],
  'member.joined': ['Ekip üyesi katıldı', 'Team member joined'],
};

export function activityLabel(eventType: string, language: 'tr' | 'en'): string {
  const labels = ACTIVITY_LABELS[eventType];
  return labels
    ? labels[language === 'tr' ? 0 : 1]
    : eventType.replaceAll('.', ' · ').replaceAll('_', ' ');
}

export function activityDestination(event: {
  workspace_id?: string;
  project_id?: string | null;
  event_type: string;
  detail?: Record<string, unknown>;
}): string {
  if (!event.workspace_id) return '/notifications';
  const root = `/w/${encodeURIComponent(event.workspace_id)}`;
  const detail = event.detail || {};
  if (typeof detail.application_id === 'string')
    return `${root}/applications/${encodeURIComponent(detail.application_id)}/${event.event_type.includes('review') ? 'review' : 'overview'}`;
  if (typeof detail.document_id === 'string')
    return `${root}/documents?document=${encodeURIComponent(detail.document_id)}${event.project_id ? `&project=${encodeURIComponent(event.project_id)}` : ''}`;
  if (typeof detail.task_id === 'string')
    return `${root}/tasks?task=${encodeURIComponent(detail.task_id)}${event.project_id ? `&project=${encodeURIComponent(event.project_id)}` : ''}`;
  if (typeof detail.call_id === 'string')
    return `${root}/funding/calls/${encodeURIComponent(detail.call_id)}`;
  if (event.project_id && event.event_type !== 'project.deleted')
    return `${root}/projects/${encodeURIComponent(event.project_id)}/${event.event_type.startsWith('funding.') ? 'eligibility' : 'overview'}`;
  return `${root}/overview`;
}
