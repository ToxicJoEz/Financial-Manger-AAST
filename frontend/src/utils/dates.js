export function dateText(value,empty='Not set'){
 if(!value)return empty;const date=new Date(value);if(!Number.isFinite(date.getTime()))return empty;
 return date.toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'});
}
export function dateInputValue(text){
 if(!text.trim())return '';const m=text.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);if(!m)return null;
 let [,d,month,year]=m;if(year.length===2)year=String(Number(year)>=70?1900+Number(year):2000+Number(year));
 const iso=`${year}-${month.padStart(2,'0')}-${d.padStart(2,'0')}`;return year!=='0000'&&Number.isFinite(Date.parse(iso))&&new Date(iso).toISOString().slice(0,10)===iso?iso:null;
}
