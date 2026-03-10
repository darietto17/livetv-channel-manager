export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { path, content, message, sha } = req.body;
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        return res.status(500).json({ error: 'Server configuration error: Missing GITHUB_TOKEN' });
    }

    const repoPath = 'darietto17/LiveTvPremium';
    const apiUrl = `https://api.github.com/repos/${repoPath}/contents/${path}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: message || `Update ${path} via Channel Manager`,
                content: content, // base64 encoded
                sha: sha,
                branch: 'master'
            }),
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.message || 'GitHub API error' });
        }

        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
