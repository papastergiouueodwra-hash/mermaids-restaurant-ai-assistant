export default async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Method not allowed."});
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl="https://kkucvaolsagjzhfkfypt.supabase.co";
  if(!serviceKey) return res.status(500).json({error:"Lead service is not configured."});
  try{
    const r=await fetch(supabaseUrl+"/rest/v1/leads?select=*&order=created_at.desc&limit=500",{headers:{apikey:serviceKey,Authorization:"Bearer "+serviceKey}});
    const data=await r.json();
    if(!r.ok) return res.status(r.status).json({error:data?.message||data?.error||"Unable to load leads."});
    return res.status(200).json({leads:Array.isArray(data)?data:[]});
  }catch(e){return res.status(500).json({error:"Unable to connect to lead service."});}
}
