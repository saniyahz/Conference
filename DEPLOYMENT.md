# Deployment Guide for ChatGPT Integration

This guide provides quick deployment instructions for publishing your Kids Story Creator app to make it accessible to ChatGPT.

## Quick Start: Deploy to Vercel

### 1. Prerequisites
- GitHub account
- Vercel account (free tier works)
- Replicate API token

### 2. Push Code to GitHub

```bash
# If not already a git repository
git init
git add .
git commit -m "Prepare Kids Story Creator for ChatGPT integration"

# Create a new repository on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/kids-story-creator.git
git push -u origin main
```

### 3. Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Configure:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `./`
   - **Build Command:** `npm run build`
   - **Output Directory:** `.next`

5. Add Environment Variables:
   ```
   REPLICATE_API_TOKEN=your_token_here
   ```
   Get your Replicate API token from [replicate.com/account](https://replicate.com/account)

6. Click "Deploy"

### 4. Note Your Deployment URL

After deployment completes (2-3 minutes), you'll get a URL like:
```
https://kids-story-creator-abc123.vercel.app
```

Copy this URL - you'll need it for the ChatGPT setup.

## Alternative: Deploy to Other Platforms

### Netlify
- Similar to Vercel, import from GitHub
- Add environment variable: `REPLICATE_API_TOKEN`
- Build command: `npm run build`
- Publish directory: `.next`

### Railway
- Connect GitHub repository
- Add environment variable
- Railway auto-detects Next.js

### Docker (Self-hosted)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

## Post-Deployment Steps

### 1. Update OpenAPI Schema

Edit `openapi.yaml` and replace the server URL:

```yaml
servers:
  - url: https://your-actual-domain.vercel.app
    description: Production server
```

### 2. Test Your API Endpoints

Test that your endpoints are accessible:

```bash
# Test story generation
curl -X POST https://your-domain.vercel.app/api/generate-story \
  -H "Content-Type: application/json" \
  -d '{"prompt": "a brave little dragon"}'

# Test CORS (should return 200)
curl -X OPTIONS https://your-domain.vercel.app/api/generate-story \
  -H "Access-Control-Request-Method: POST" \
  -H "Origin: https://chat.openai.com"
```

### 3. Verify Environment Variables

In your deployment platform:
1. Go to Settings → Environment Variables
2. Verify `REPLICATE_API_TOKEN` is set
3. Redeploy if you added it after initial deployment

### 4. Monitor Costs

- Check your Replicate dashboard for usage
- Story generation: ~$0.10-0.50 per story
- Image generation: ~$0.03-0.05 per image
- Total per story: ~$0.50-1.00 (10 pages)

Set up billing alerts if available.

## Next Steps

Once deployed:
1. ✅ Your API is publicly accessible
2. ✅ CORS headers are configured for ChatGPT
3. ✅ OpenAPI schema describes your endpoints

Now follow the `CHATGPT_SETUP.md` guide to create your custom GPT!

## Troubleshooting

### Build Failures
- Check Node.js version (requires 18+)
- Ensure all dependencies are in `package.json`
- Check build logs for specific errors

### API Not Working
- Verify `REPLICATE_API_TOKEN` is set correctly
- Check function logs for errors
- Ensure you have Replicate credits

### CORS Errors
- Verify CORS headers are in all API routes
- Check browser console for specific CORS errors
- Test with curl to isolate client vs server issues

### Slow Response Times
- Image generation takes 30-60 seconds per image
- Consider implementing progress webhooks for production
- ChatGPT may timeout on very long operations

## Security Considerations

### Current Setup (Development)
- ✅ CORS allows all origins (`*`)
- ⚠️ No API key authentication
- ⚠️ No rate limiting (relies on Replicate's limits)

### For Production
Consider adding:
1. **API Key Authentication**
2. **Rate Limiting** (per IP or user)
3. **Request Validation**
4. **Usage Monitoring**
5. **Cost Alerts**

See `CHATGPT_SETUP.md` for details on adding API key authentication.

## Updating Your Deployment

When you make changes:

```bash
git add .
git commit -m "Update story generation logic"
git push
```

Vercel automatically redeploys on push to main branch.

## Custom Domain (Optional)

1. In Vercel, go to Settings → Domains
2. Add your custom domain (e.g., `storytime.example.com`)
3. Update DNS records as instructed
4. Update `openapi.yaml` with new domain
5. Update GPT actions in ChatGPT

---

**Ready to create your ChatGPT GPT?** → See `CHATGPT_SETUP.md`

**Need help?** → Check the main `README.md` for troubleshooting
