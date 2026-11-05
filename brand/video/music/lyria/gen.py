import sys,json,base64,urllib.request,os
model,name,prompt=sys.argv[1:4]
body={"contents":[{"parts":[{"text":prompt}]}],"generationConfig":{"responseModalities":["AUDIO","TEXT"]}}
r=urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={os.environ['GEMINI_API_KEY']}",json.dumps(body).encode(),{"Content-Type":"application/json"})
try: d=json.load(urllib.request.urlopen(r,timeout=300))
except urllib.error.HTTPError as e: print(e.read().decode()[:600]); sys.exit(1)
for p in d["candidates"][0]["content"]["parts"]:
    if "text" in p: print(p["text"][:800])
    if "inlineData" in p:
        ext="mp3" if "mp3" in p["inlineData"]["mimeType"] or "mpeg" in p["inlineData"]["mimeType"] else "wav"
        open(f"{name}.{ext}","wb").write(base64.b64decode(p["inlineData"]["data"])); print("saved",name,ext,p["inlineData"]["mimeType"])
