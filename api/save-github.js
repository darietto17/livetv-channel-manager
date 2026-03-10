export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { path, content, message } = req.body;
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        return res.status(500).json({ error: 'Server configuration error: Missing GITHUB_TOKEN' });
    }

    const repoPath = 'darietto17/LiveTvPremium';
    const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${path}`;
    const headers = {
        'Authorization': `token ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Vercel-Serverless-Proxy'
    };

    try {
        // 1. Get current SHA (if file exists)
        const getRes = await fetch(apiUrl, { headers });
        let sha = undefined;
        if (getRes.ok) {
            const fileData = await getRes.json();
            sha = fileData.sha;
        }

        // 2. Perform the PUT (create or update)
        const putResponse = await fetch(apiUrl, {
            method: 'PUT',
            headers,
            body: JSON.stringify({
                message: message || `Update ${path} via Channel Manager`,
                content: content, // base64 encoded
                sha: sha,
                branch: 'master'
            }),
        });

        const data = await putResponse.json();

        if (!putResponse.ok) {
            return res.status(putResponse.status).json({ error: data.message || 'GitHub API error' });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
