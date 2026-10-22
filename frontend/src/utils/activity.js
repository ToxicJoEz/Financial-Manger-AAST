import axios from 'axios';
export function recordClientFailure(message,fileName,action='IMPORT_FILE_REJECTED'){
 return axios.post('/activity-events',{action,message,fileName}).catch(()=>{console.warn('Client activity could not reach the server.');});
}
