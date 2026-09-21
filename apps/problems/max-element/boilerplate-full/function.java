
import java.io.*;
import java.util.*;

public class Main {
    
    ##USER_CODE_HERE##

    public static void main(String[] args) {
        // The judge pipes the testcase in on stdin.
        List<String> lines = readLinesFromStdin();
        int size_arr = Integer.parseInt(lines.get(0).trim());
        List<Integer> arr = new ArrayList<>(Math.max(size_arr, 0));
        if (size_arr > 0 && lines.size() > 1) {
            for (String token_arr : lines.get(1).trim().split("\\s+")) {
                if (!token_arr.isEmpty()) {
                    arr.add(Integer.parseInt(token_arr));
                }
            }
        }
        int result = maxElement(arr);
        System.out.println(result);
    }

    public static List<String> readLinesFromStdin() {
        List<String> lines = new ArrayList<>();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(System.in))) {
            String line;
            while ((line = br.readLine()) != null) {
                lines.add(line);
            }
        } catch (IOException e) {
            e.printStackTrace();
        }
        return lines;
    }
}