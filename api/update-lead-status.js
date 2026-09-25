export default async function handler(req,res){
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Methods","PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  if(req.method==="OPTIONS") return res.status(204).end();
  if(req.method!=="PATCH") return res.status(405).json({error:"Method not allowed."});

  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl="https://kkucvaolsagjzhfkfypt.supabase.co";
  if(!serviceKey) return res.status(500).json({error:"Lead service is not configured."});

  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const id=String(body.id||"").trim();
    const status=String(body.status||"").trim();
    const allowed=["New","Contacted","Confirmed","Cancelled"];

    if(!id) return res.status(400).json({error:"Lead ID is required."});
    if(!allowed.includes(status)) return res.status(400).json({error:"Invalid lead status."});

    const r=await fetch(supabaseUrl+"/rest/v1/leads?id=eq."+encodeURIComponent(id),{
      method:"PATCH",
      headers:{
        "Content-Type":"application/json",
        apikey:serviceKey,
        Authorization:"Bearer "+serviceKey,
        Prefer:"return=representation"
      },
      body:JSON.stringify({status})
    });

    const data=await r.json().catch(()=>null);
    if(!r.ok) return res.status(r.status).json({error:data?.message||data?.error||"Unable to update lead."});
    if(!Array.isArray(data)||!data.length) return res.status(404).json({error:"Lead not found."});

    return res.status(200).json({lead:data[0]});
  }catch(e){
    return res.status(500).json({error:"Unable to update lead status."});
  }
}