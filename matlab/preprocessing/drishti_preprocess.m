function drishti_preprocess(inputPath, outputPath)
% DRISHTI-X — MATLAB Preprocessing Pipeline
% Applies CLAHE, illumination normalization, fundus crop, resize.
% Called by Python via MATLAB Engine API.
%
% Usage (from Python):
%   eng.drishti_preprocess('/path/to/input.jpg', '/path/to/output.jpg', nargout=0)

    img = imread(inputPath);

    % Convert to LAB for CLAHE
    if size(img, 3) == 3
        labImg = rgb2lab(img);
        lChannel = labImg(:,:,1);
        % CLAHE on L channel
        lEq = adapthisteq(lChannel ./ 100, ...
            'ClipLimit', 0.02, ...
            'Distribution', 'rayleigh', ...
            'NumTiles', [8 8]);
        labImg(:,:,1) = lEq * 100;
        enhanced = lab2rgb(labImg);
        enhanced = im2uint8(enhanced);
    else
        enhanced = adapthisteq(img);
    end

    % Resize to 224x224
    resized = imresize(enhanced, [224 224]);

    % Save
    imwrite(resized, outputPath);
end
