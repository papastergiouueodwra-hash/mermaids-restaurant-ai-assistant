export default async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Method not allowed."});
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl="https://kkucvaolsagjzhfkfypt.supabase.co";
  if(!serviceKey) return res.status(500).json({error:"Lead service is not configured."});
  try{
    const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):(req.body||{});
    const lead={
      name:body.name||"",
      phone:body.phone||"",
      email:body.email||"",
      guests:body.guests??null,
      date:body.date||"",
      time:body.time||"",
      message:body.message||body.notes||"",
      source:"mermaids"
    };
    const r=await fetch(supabaseUrl+"/rest/v1/leads",{method:"POST",headers:{"Content-Type":"application/json",apikey:serviceKey,Authorization:"Bearer "+serviceKey,Prefer:"return=representation"},body:JSON.stringify(lead)});
    const data=await r.json().catch(()=>null);
    if(!r.ok) return res.status(r.status).json({error:data?.message||data?.error||"Unable to save lead."});
    return res.status(201).json({lead:data?.[0]||data});
  }catch(e){return res.status(500).json({error:"Unable to save lead."});}
}
