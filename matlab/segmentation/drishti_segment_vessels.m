function vesselMask = drishti_segment_vessels(imagePath, outputPath)
% DRISHTI-X — MATLAB Vessel Segmentation
% Uses morphological operations to segment retinal vessels.
% For full accuracy, train a U-Net using Deep Learning Toolbox.
%
% Usage (from Python):
%   mask = eng.drishti_segment_vessels('/path/to/image.jpg', '/path/to/mask.jpg', nargout=1)

    img = imread(imagePath);
    green = img(:,:,2);  % Green channel has best vessel contrast

    % Invert: vessels are dark
    invGreen = imcomplement(green);

    % CLAHE on green channel
    claheImg = adapthisteq(invGreen, 'ClipLimit', 0.01, 'NumTiles', [8 8]);

    % Top-hat filter to extract fine vessels
    se = strel('disk', 8);
    topHat = imtophat(claheImg, se);

    % Threshold
    level = graythresh(topHat);
    vesselMask = imbinarize(topHat, level * 0.7);

    % Clean up small noise
    vesselMask = bwareaopen(vesselMask, 50);
    vesselMask = imclose(vesselMask, strel('line', 5, 0));

    if nargin > 1 && ~isempty(outputPath)
        imwrite(vesselMask, outputPath);
    end
end
