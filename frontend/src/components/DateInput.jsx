import {useEffect,useRef,useState} from 'react';
import {CalendarDays} from 'lucide-react';
import {dateText,dateInputValue} from '../utils/dates';
export default function DateInput({value='',onChange,min,max,required=false,disabled=false,className='input-field',onBlur,onFocus,type:ignoredType,...props}){
 const iso=String(value||'').slice(0,10),[draft,setDraft]=useState(()=>dateText(iso,'')),[focused,setFocused]=useState(false),input=useRef(null),picker=useRef(null);
 useEffect(()=>{if(!focused)setDraft(dateText(iso,''));},[iso]);
 const validate=text=>{const parsed=dateInputValue(text);return parsed===null?'Use DD/MM/YY and a valid calendar date.':parsed&&min&&parsed<min?`Use a date on or after ${dateText(min)}.`:parsed&&max&&parsed>max?`Use a date on or before ${dateText(max)}.`:'';};
 useEffect(()=>{input.current?.setCustomValidity(validate(draft));},[draft,min,max]);
 const change=(text)=>{setDraft(text);input.current?.setCustomValidity(validate(text));const parsed=dateInputValue(text);if(parsed!==null)onChange?.({target:{value:parsed,name:props.name,id:props.id},currentTarget:{value:parsed}});};
 return <span className="date-input-shell"><input {...props} ref={input} type="text" inputMode="numeric" autoComplete="off" placeholder="DD/MM/YY" className={className} required={required} disabled={disabled} value={draft} onChange={e=>change(e.target.value)} onFocus={e=>{setFocused(true);onFocus?.(e);}} onBlur={e=>{const parsed=dateInputValue(draft);if(parsed!==null)setDraft(dateText(parsed,''));setFocused(false);onBlur?.(e);}}/><button className="date-picker-trigger" type="button" disabled={disabled} aria-label="Choose date from calendar" onClick={()=>{try{picker.current.showPicker();}catch{input.current?.focus();}}}><CalendarDays size={16}/></button><input ref={picker} className="date-native-picker" type="date" aria-hidden="true" tabIndex={-1} value={iso} min={min} max={max} disabled={disabled} onChange={e=>{const next=e.target.value;setDraft(dateText(next,''));onChange?.({target:{value:next,name:props.name,id:props.id},currentTarget:{value:next}});}}/></span>;
}
