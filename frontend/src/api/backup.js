import client from './client';

export const backupApi = {
  list:    ()                          => client.get('/backup'),
  runNow:  ()                          => client.post('/backup/now'),
  restore: (filePath, confirm)         => client.post('/backup/restore', { filePath, confirm }),
  download:(fileName)                  =>
    client.get('/backup/download', { params: { file: fileName }, responseType: 'blob' }),
};
