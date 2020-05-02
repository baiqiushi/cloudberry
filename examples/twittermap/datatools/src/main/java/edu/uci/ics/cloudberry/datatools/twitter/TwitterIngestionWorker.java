package edu.uci.ics.cloudberry.datatools.twitter;

import com.google.common.collect.Lists;
import com.twitter.hbc.ClientBuilder;
import com.twitter.hbc.core.Client;
import com.twitter.hbc.core.Constants;
import com.twitter.hbc.core.endpoint.StatusesFilterEndpoint;
import com.twitter.hbc.core.endpoint.Location;
import com.twitter.hbc.core.processor.StringDelimitedProcessor;
import com.twitter.hbc.httpclient.auth.Authentication;
import com.twitter.hbc.httpclient.auth.OAuth1;

import java.io.*;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.zip.GZIPOutputStream;

/**
 * TwitterIngestionWorker
 *
 * TwitterIngestionWorker is a runnable class.
 * Once starts, it connects to Twitter streaming API "https://stream.twitter.com/1.1/statuses/filter.json"
 * using filtering conditions defined in config (e.g. tracking keywords or tracking location),
 * and dump the json into a gzip file in a daily manner.
 *
 * Reference: https://developer.twitter.com/en/docs/tweets/filter-realtime/api-reference/post-statuses-filter
 *
 * @author Qiushi Bai, baiqiushi@gmail.com
 */
public class TwitterIngestionWorker implements Runnable {

    /** stats */
    Date startTime;
    long counter;
    int averageRate;
    int instantCounter;
    long instantStart;
    long instantStop;
    int instantRate;

    TwitterIngestionConfig config;
    Client twitterClient;
    BufferedWriter fileWriter;
    StringBuffer outStream;
    Date currentDate;
    SimpleDateFormat dateFormatter;
    SimpleDateFormat timeFormatter;

    public TwitterIngestionWorker(TwitterIngestionConfig _config, StringBuffer _outStream) {
        dateFormatter = new SimpleDateFormat("yyyy-MM-dd");
        timeFormatter = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
        config = _config;
        outStream = _outStream;
        averageRate = 0;
        instantRate = 0;
    }

    public Date getStartTime() {
        return startTime;
    }

    public long getCounter() {
        return counter;
    }

    public int getAverageRate() {
        return averageRate;
    }

    public int getInstantRate() {
        return instantRate;
    }

    /**
     * Check if we need to rotate the output file
     *
     * Note: currently only support daily rotation.
     *
     * @return
     */
    private boolean rotateFile() {
        Date now = new Date();
        Calendar current = Calendar.getInstance();
        current.setTime(currentDate);
        Calendar rightNow = Calendar.getInstance();
        rightNow.setTime(now);
        boolean sameDay = current.get(Calendar.YEAR) == rightNow.get(Calendar.YEAR)
                && current.get(Calendar.MONTH) == rightNow.get(Calendar.MONTH)
                && current.get(Calendar.DAY_OF_MONTH) == rightNow.get(Calendar.DAY_OF_MONTH);
        return !sameDay;
    }

    /**
     * Get the file writer handle for ingestion worker.
     *  - if there's exiting gzip file for today (e.g. [prefix]_2020-05-01.gz)
     *    - open this file in append mode.
     *  - else
     *    - create new file with today's date. (e.g. [prefix]_2020-05-01.gz)
     *
     * @return
     */
    private BufferedWriter getFileWriter(String filePath, String prefix)  throws IOException {
        currentDate = new Date();
        String strDate = dateFormatter.format(currentDate);
        String fileName = prefix + "_" + strDate + ".gz";
        if (filePath.endsWith("/")) {
            fileName = filePath + fileName;
        }
        else {
            fileName = filePath + "/" + fileName;
        }
        GZIPOutputStream zip = new GZIPOutputStream(
                new FileOutputStream(new File(fileName), true));
        BufferedWriter bw = new BufferedWriter(
                new OutputStreamWriter(zip, "UTF-8"));
        return bw;
    }

    @Override
    public void run() {
        System.out.println("Twitter Ingestion Worker starts!");

        try {
            fileWriter = getFileWriter(config.getOutputPath(), config.getFilePrefix());
        } catch (IOException e) {
            System.err.println("Opening output file failed!");
            e.printStackTrace();
            return;
        }

        BlockingQueue<String> queue = new LinkedBlockingQueue<String>(10000);
        StatusesFilterEndpoint endpoint = new StatusesFilterEndpoint();

        // add tracking keywords
        if (config.getTrackKeywords().length != 0) {
            System.out.print("Tracking keywords: ");
            for (String keyword : config.getTrackKeywords()) {
                System.out.print(keyword);
                System.out.print(" ");
            }
            System.out.println();

            endpoint.trackTerms(Lists.newArrayList(config.getTrackKeywords()));
        }

        // add tracking location
        if (config.getTrackLocation().length != 0) {
            System.out.print("Tracking location:");
            for (Location location : config.getTrackLocation()) {
                System.out.print(location);
                System.out.print(" ");
            }
            System.out.println();

            endpoint.locations(Lists.newArrayList(config.getTrackLocation()));
        }

        // add OAuth keys
        Authentication auth = new OAuth1(config.getConsumerKey(), config.getConsumerSecret(), config.getToken(),
                config.getTokenSecret());

        // build twitter client
        twitterClient = new ClientBuilder()
                .hosts(Constants.STREAM_HOST)
                .endpoint(endpoint)
                .authentication(auth)
                .processor(new StringDelimitedProcessor(queue))
                .build();

        try {
            twitterClient.connect();
            startTime = new Date();
            counter = 0;
            instantCounter = 0;
            instantStart = System.currentTimeMillis();

            while (!twitterClient.isDone()) {
                // get one tweet
                String msg = queue.take();

                // count stats
                counter ++;
                instantCounter ++;
                if (instantCounter == 10000) {
                    instantStop = System.currentTimeMillis();
                    instantRate = (int) (instantCounter * 1000 / (instantStop - instantStart));
                    instantCounter = 0;
                }
                if (counter % 100000 == 0) {
                    Date rightNow = new Date();
                    long totalSeconds = (rightNow.getTime() - startTime.getTime()) / 1000;
                    averageRate = (int) (counter / totalSeconds);
                    String time = timeFormatter.format(rightNow);
                    System.out.println("[" + time + "] Ingested " + counter + " tweets since " + timeFormatter.format(startTime));
                    System.out.println("[" + time + "] Average rate: " + averageRate + " tweets/s.");
                }

                // if needs to rotate file, get new file writer
                if (rotateFile()) {
                    fileWriter = getFileWriter(config.getOutputPath(), config.getFilePrefix());
                }

                // write to file
                fileWriter.write(msg);

                // write to out stream
                outStream.setLength(0);
                outStream.append(msg);
            }
        } catch (InterruptedException | IOException e) {
            e.printStackTrace();
        } finally {
            if (fileWriter != null) {
                try {
                    fileWriter.close();
                } catch (IOException e) {
                    e.printStackTrace();
                }
            }
            if (twitterClient != null) {
                twitterClient.stop();
            }
        }
    }

    public void cleanUp() {
        if (fileWriter != null) {
            try {
                fileWriter.close();
            } catch (IOException e) {
                e.printStackTrace();
            }
        }
        if (twitterClient != null) {
            twitterClient.stop();
        }
    }
}