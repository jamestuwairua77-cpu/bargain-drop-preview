export default function(req, res) {
  res.etHeader('Content-Type', 'application/javascript');
  res.etHeader('Cache-Control', 'public, max-age=31536000');
  res.send(`%0`%);
}
