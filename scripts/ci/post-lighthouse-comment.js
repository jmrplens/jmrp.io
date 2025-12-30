const fs = require('fs');

module.exports = async ({ github, context }) => {
  const theme = process.env.THEME;
  const commentFile = `lighthouse_comment_${theme}.md`;

  if (fs.existsSync(commentFile)) {
    const comment = fs.readFileSync(commentFile, 'utf8');
    
    await github.rest.issues.createComment({
      issue_number: context.issue.number,
      owner: context.repo.owner,
      repo: context.repo.repo,
      body: comment
    });
  } else {
    console.log(`Comment file not found: ${commentFile}`);
  }
};
