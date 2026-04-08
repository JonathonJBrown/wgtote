import { useState, useEffect } from "react";
import TwoColumnApp from "./TwoColumn";
import ThreeColumnApp from "./ThreeColumn";
import FourColumnApp from "./FourColumn";

export default function App() {
  const [layout, setLayout] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem("wg_layout");
    if (saved) setLayout(saved);
  }, []);

  const pick = (v) => {
    localStorage.setItem("wg_layout", v);
    setLayout(v);
  };

  if (layout === "2col") return <TwoColumnApp />;
  if (layout === "3col") return <ThreeColumnApp />;
  if (layout === "4col") return <FourColumnApp />;

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0C0E13",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{textAlign:"center",maxWidth:400,padding:24}}>
        <h1 style={{fontSize:26,color:"#E8EAF0",marginBottom:4}}>Winter<span style={{color:"#6C8AFF",fontStyle:"italic"}}>Guard</span> Tote</h1>
        <p style={{fontSize:11,color:"#6B7590",marginBottom:24}}>Choose your preferred layout</p>

        <button onClick={()=>pick("2col")} style={{width:"100%",padding:"16px 20px",borderRadius:8,border:"2px solid #2A2F3D",background:"#14171E",color:"#E8EAF0",cursor:"pointer",marginBottom:10,textAlign:"left",fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>2 Column</div>
          <div style={{fontSize:10,color:"#9BA3B5",lineHeight:1.4}}>Two scoring scales on top, ranking table + notes side by side below. Best for smaller screens or iPad split-screen.</div>
        </button>

        <button onClick={()=>pick("3col")} style={{width:"100%",padding:"16px 20px",borderRadius:8,border:"2px solid #2A2F3D",background:"#14171E",color:"#E8EAF0",cursor:"pointer",marginBottom:10,textAlign:"left",fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>3 Column</div>
          <div style={{fontSize:10,color:"#9BA3B5",lineHeight:1.4}}>Vocabulary, Excellence, and Ranking panel all side by side with notes below. Best for full-screen iPad portrait.</div>
        </button>

        <button onClick={()=>pick("4col")} style={{width:"100%",padding:"16px 20px",borderRadius:8,border:"2px solid #2A2F3D",background:"#14171E",color:"#E8EAF0",cursor:"pointer",marginBottom:16,textAlign:"left",fontFamily:"'DM Sans',sans-serif"}}>
          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>4 Column</div>
          <div style={{fontSize:10,color:"#9BA3B5",lineHeight:1.4}}>Vocabulary, Excellence, Ranking, and Notes all side by side. Best for full-screen iPad landscape or desktop.</div>
        </button>

        <p style={{fontSize:9,color:"#6B7590"}}>You can switch layouts later in Settings.</p>
      </div>
    </div>
  );
}
