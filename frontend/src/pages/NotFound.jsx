import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
export default function NotFound(){return <div className="state-page"><span className="state-code">404</span><h1>A little off course.</h1><p>We couldn’t find this page. Let’s get you back to your workspace.</p><Link className="btn-primary" to="/"><ArrowLeft size={17}/>Back to overview</Link></div>}
