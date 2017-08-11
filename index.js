const gm = require('gm').subClass({imageMagick: true})
const AWS = require('aws-sdk')
const S3 = new AWS.S3({region: 'eu-central-1'})
const fs = require('fs')
const async = require('async')
const acceptable_file = /^(.+)\.(png|jpg|gif|PNG|JPG|GIF)$/
const file_to_mime = {'gif': 'image/gif', 'png': 'image/png', 'jpg': 'image/jpg'}

function fetch_image(srcBucket, srcPath, do_after) {
  let file_ending = 'txt'
  let matches = srcPath.match(/.+\.(\w+)$/)
  if (matches) {
    file_ending = matches[1]
  }
  let target_path = `/tmp/srcfile.${file_ending}`
  let outfile = fs.createWriteStream(target_path);
  console.log(`Fetching S3 object: ${JSON.stringify({srcBucket, srcPath, target_path})}`)
  S3.getObject({
    Bucket: srcBucket,
    Key: srcPath
  }).createReadStream().pipe(outfile).on('finish', ()=>{
    do_after(null, target_path)
  })
}

function add_watermark(src_path, do_after) {
  const watermark_path = './cts-outline.png'
  let matches = src_path.match(acceptable_file)
  if (!matches) {
    let err = `File ${src_path} is not a supported file format`
    console.log(err)
    do_after(err)
  } else {
    let [unused, path_base, file_ending] = matches
    let target_path = `${path_base}_wm.${file_ending}`
    console.log(`Adding watermark on: ${JSON.stringify({src_path, target_path, watermark_path})}`)
    // want to use autoOrient() here, but it produces error. Maybe in next version...
    gm(src_path)./*autoOrient().*/composite(watermark_path).gravity('SouthEast').write(target_path, (err)=>{
      if (err) {
        console.log(`Error on applying watermark: file: ${src_path}, error: "${err}"`)
        do_after(err)
      } else {
        console.log(`Applying watermark on file: ${src_path}`)
        do_after(null, target_path)
      }
    })
  }
}

function upload_image(src_path, target_bucket, target_path, do_after) {
  let instr = fs.createReadStream(src_path)
  let [unused1, unused2, file_ending] = target_path.match(acceptable_file)
  file_ending = file_ending.toLowerCase()
  let mime_type = file_to_mime[file_ending]
  console.log(`uploading ${JSON.stringify({target_bucket, target_path, mime_type})}`)
  S3.putObject({Bucket: target_bucket, Key: target_path, Body: instr, ContentType: mime_type, ACL: 'public-read'}, do_after)
}

exports.handler = function(event, context) {
  let src_bucket = event.Records[0].s3.bucket.name
  let src_path = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " ")) // event.Records[0].s3.object.key
  console.log(`S3 event: ${JSON.stringify({src_bucket, src_path})}`)
  let matches = src_path.match(acceptable_file)
  if (!matches) {
    console.log(`Not acceptable file: "${src_path}". No action taken.`)
    context.done()
    return
  }
  if (src_path.match(/_cyg\./)) {
    console.log(`Received signal about watermarked file: ${src_path} -- ignoring`)
    context.done()
    return
  }
  let target_path = `${matches[1]}_cyg.${matches[2]}`

  async.waterfall([
    (cb)=>{fetch_image(src_bucket, src_path, cb)},
    add_watermark,
    (path, cb)=>{upload_image(path, src_bucket, target_path, cb)}], (err, results)=>{
      console.log(`Done processing image ${src_path}`)
      context.done()
  })
}
