function result = drishti_quality_assessment(imagePath)
% DRISHTI-X — MATLAB Image Quality Assessment
% Returns a struct with quality scores.
%
% Usage (from Python):
%   result = eng.drishti_quality_assessment('/path/to/image.jpg', nargout=1)

    img = imread(imagePath);
    gray = rgb2gray(img);

    % Focus score: Laplacian variance
    laplacian = imfilter(double(gray), fspecial('laplacian'));
    lapVar = var(laplacian(:));
    focusScore = min(100, lapVar / 500 * 100);

    % Illumination score: mean brightness
    meanBright = mean(gray(:));
    if meanBright < 30
        illumScore = 0;
    elseif meanBright > 230
        illumScore = 0;
    else
        illumScore = max(0, 100 - abs(double(meanBright) - 120) / 120 * 100);
    end

    % FOV score: retinal coverage ratio
    bw = imbinarize(gray, 20/255);
    bw = imclose(bw, strel('disk', 15));
    fovScore = min(100, sum(bw(:)) / numel(bw) * 150);

    % Overall quality
    qualityScore = focusScore * 0.4 + illumScore * 0.35 + fovScore * 0.25;
    isGradable = qualityScore >= 50 && focusScore >= 25 && illumScore >= 20;

    result = struct(...
        'quality_score', qualityScore, ...
        'focus_score',   focusScore, ...
        'illumination_score', illumScore, ...
        'fov_score', fovScore, ...
        'is_gradable', isGradable, ...
        'execution_engine', 'MATLAB' ...
    );
end
